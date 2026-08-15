/**
 * A pipe with messages in it, and the whole of what the tool asks of a network.
 *
 * Two sides need to find each other: an application with a machine in it, and a page drawing that
 * machine somewhere else — another tab, another process, another host. What passes between them is
 * described in `entities/machine/model/wire`; how it gets there is described here, in one channel
 * and one machine, so that neither side has a socket in it.
 *
 * The one implementation is a WebSocket, because it is the one transport a browser and a Node
 * process both have without installing anything. A message channel between two tabs of the same
 * origin would be another, and would need nothing here to change.
 *
 * What arrives is announced on a channel and whether the wire is up is held by a machine — the two
 * tools this whole tool is about. Three hand-rolled sets of listeners stood here first, which is
 * the sort of thing a debugger for message-passing machines should be the last program to contain.
 */
import Channel from "@evgkch/channeljs";
import type { Rx } from "@evgkch/channeljs";
import { newDialling } from "./model/dialling.js";

/** What a pipe says: something arrived, or the wire itself moved. */
export type Heard = {
  hear: [msg: unknown];
  /** It came up — including every time it came back, which is when to say everything again. */
  open: [];
  down: [];
};

/** Where messages go and come from. Nothing about who is on the other end. */
export type Link = {
  /** Best effort. A message sent while the pipe is down is dropped, and that is the contract. */
  readonly send: (msg: unknown) => void;
  readonly rx: Rx<Heard>;
  /** Is it up right now — asked of the machine that knows, not of whichever socket exists. */
  readonly live: () => boolean;
  readonly stop: () => void;
};

/** How long to wait before dialling again. One second: a debugger is watched, not deployed. */
const AGAIN = 1000;

/**
 * A link over a socket, kept up by redialling.
 *
 * Nothing is queued while it is down. A dropped message is not a hole in the picture, because
 * neither side ever sends a difference it cannot restate: the viewer asks again when the pipe
 * comes up and the publisher answers with everything it has. Repair is a snapshot, not a log —
 * which is also why a viewer opened an hour late sees the whole run rather than the tail of it.
 */
export function newSocket(url: string): Link {
  const heard = new Channel<Heard>();
  const dial = newDialling();
  let sock: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const ring = () => {
    if (done) return;
    const it = new WebSocket(url);
    sock = it;
    it.addEventListener("open", () => {
      dial.dispatch("up");
      heard.tx.send("open");
    });
    it.addEventListener("message", (e: MessageEvent) => {
      // Whatever is on the wire is somebody else's text until it has been read. Parsing is here
      // and understanding is above: this says it was JSON, `isWire` says it was ours.
      let msg: unknown;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      heard.tx.send("hear", msg);
    });
    // Both ends of a lost connection arrive here, and the difference between "refused" and
    // "closed" is not one this has anything to do about: dial again.
    it.addEventListener("close", () => {
      if (sock === it) sock = null;
      dial.dispatch("down");
      heard.tx.send("down");
      if (!done) timer = setTimeout(ring, AGAIN);
    });
    it.addEventListener("error", () => it.close());
  };
  ring();

  return {
    send: (msg) => {
      if (sock?.readyState === 1) sock.send(JSON.stringify(msg));
    },
    rx: heard.rx,
    live: () => dial.state.type === "live",
    stop: () => {
      done = true;
      if (timer) clearTimeout(timer);
      heard.clear();
      sock?.close();
      sock = null;
    },
  };
}

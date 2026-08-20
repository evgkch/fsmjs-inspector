/**
 * The transport: what crosses is described in `entities/machine/model/wire`; how it gets there
 * is one channel and one machine, so neither side holds a socket. The one implementation is a
 * WebSocket — the transport a browser and a Node process both have without installing anything.
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
 * A link over a socket, kept up by redialling. Nothing is queued while it is down: the protocol
 * restates rather than continues, so repair is a snapshot, not a log.
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
      // Parsing here, understanding above: this says it was JSON, `isWire` says it was ours.
      let msg: unknown;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      heard.tx.send("hear", msg);
    });
    // Refused and closed both land here; either way, dial again.
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

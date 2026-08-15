/**
 * A pipe with messages in it, and the whole of what the tool asks of a network.
 *
 * Two sides need to find each other: an application with a machine in it, and a page drawing that
 * machine somewhere else — another tab, another process, another host. What passes between them is
 * described in `entities/machine/model/wire`; how it gets there is described here, in three
 * functions, so that neither side has a socket in it.
 *
 * The one implementation is a WebSocket, because it is the one transport a browser and a Node
 * process both have without installing anything. A message channel between two tabs of the same
 * origin would be another, and would need nothing here to change.
 */

/** Where messages go and come from. Nothing about who is on the other end. */
export type Link = {
  /** Best effort. A message sent while the pipe is down is dropped, and that is the contract. */
  readonly send: (msg: unknown) => void;
  /** Hear everything that arrives. Returns the way to stop hearing. */
  readonly on: (hear: (msg: unknown) => void) => () => void;
  /** Called whenever the pipe comes up, including every time it comes back. */
  readonly open: (say: () => void) => () => void;
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
  const hears = new Set<(msg: unknown) => void>();
  const opens = new Set<() => void>();
  let sock: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const dial = () => {
    if (done) return;
    const it = new WebSocket(url);
    sock = it;
    it.addEventListener("open", () => {
      for (const say of opens) say();
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
      for (const hear of hears) hear(msg);
    });
    // Both ends of a lost connection arrive here, and the difference between "refused" and
    // "closed" is not one this has anything to do about: dial again.
    it.addEventListener("close", () => {
      if (sock === it) sock = null;
      if (!done) timer = setTimeout(dial, AGAIN);
    });
    it.addEventListener("error", () => it.close());
  };
  dial();

  return {
    send: (msg) => {
      if (sock?.readyState === 1) sock.send(JSON.stringify(msg));
    },
    on: (hear) => {
      hears.add(hear);
      return () => hears.delete(hear);
    },
    open: (say) => {
      opens.add(say);
      return () => opens.delete(say);
    },
    stop: () => {
      done = true;
      if (timer) clearTimeout(timer);
      hears.clear();
      opens.clear();
      sock?.close();
      sock = null;
    },
  };
}

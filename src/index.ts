/**
 * @evgkch/fsmjs-inspector — the main entry, what an application writes:
 *
 *   const cart = inspect(new StateMachine(schema, start), { name: "cart" });
 *
 * `inspect` returns the machine it was given, with one listener attached. Nothing here draws —
 * the debugged process may have no DOM. What goes over the wire (`entities/machine/model/wire`)
 * is names only: the schema as `JSON.stringify` writes it, and the four types of every
 * transition. All machines of one process share one socket per address.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { AnyMachine } from "@evgkch/fsmjs";
import type { Graph } from "./entities/machine/model/graph.js";
import { isWire } from "./entities/machine/model/wire.js";
import type { Kept, Went } from "./entities/machine/model/wire.js";
import { newSocket } from "./shared/api/link.js";
import type { Link } from "./shared/api/link.js";
import type { Row } from "./shared/lang/rules.js";

/** Where the relay listens by default — the same address the packaged viewer dials. */
export const RELAY = "ws://localhost:8999";

/**
 * A recorder, as `history(fsm)` from `@evgkch/fsmjs/debug` makes one — asked for by its shape, so
 * that this file needs no generic parameters to accept somebody's real one.
 */
export type Past = {
  readonly index: number;
  jump(index: number): boolean;
  readonly rx: {
    on(msg: "moved", hear: (index: number) => void): () => boolean;
  };
};

export type Options = {
  /** What to call it on the inspector's page. */
  name?: string;
  /** A line about what the machine is for — the schema does not say. */
  description?: string;
  /**
   * A recorder from `history(fsm)` (`@evgkch/fsmjs/debug`); passing one turns rewinding on.
   * Rewinding from the inspector's window moves this machine, in this process, through it.
   */
  history?: Past;
  /**
   * Send payloads and contexts with the steps, not names alone — what JSON can write of them.
   * Off by default: the wire is names only, an application's data does not leave it unasked.
   */
  carry?: boolean;
  /** Where the inspector is listening, when it is not on this host. */
  url?: string;
  /** A pipe of your own — anything with the three functions on it. Then `url` is not used. */
  link?: Link;
};

/** One socket per address, refcounted: closed when the last machine using it stops. */
const pipes = new Map<string, { link: Link; users: number }>();

const dial = (url: string): Link => {
  const held = pipes.get(url) ?? { link: newSocket(url), users: 0 };
  held.users++;
  pipes.set(url, held);
  return held.link;
};

const drop = (url: string) => {
  const held = pipes.get(url);
  if (!held) return;
  if (--held.users > 0) return;
  pipes.delete(url);
  held.link.stop();
};

/** Told apart from the machine beside it, and from the same machine in the run before this one. */
let count = 0;
const idOf = () =>
  `${Date.now().toString(36)}-${(++count).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Publish what this machine does, and return it — not wrapped, not proxied: the same object with
 * one listener on its channel.
 */
export function inspect<T extends AnyMachine>(fsm: T, opts: Options = {}): T {
  const who = idOf();
  const name = opts.name ?? `machine ${count}`;
  const note = opts.description ?? "";
  const url = opts.url ?? RELAY;
  // A link handed in is the caller's to close; one dialled here is shared and refcounted.
  const own = !opts.link;
  const link = opts.link ?? dial(url);

  // The machine's own dump is its graph.
  const graph = JSON.parse(JSON.stringify(fsm)) as Graph;
  const steps: Went[] = [];
  const past = opts.history;

  const hello = () =>
    link.send({
      say: "hello",
      who,
      name,
      note,
      graph,
      at: String(fsm.state.type),
      // With nothing recording, the machine is always at the end of what happened.
      step: past ? past.index : steps.length,
      steps,
      can: { history: !!past },
    });

  // Sent only under `carry: true`, and only what JSON can write — a context an application
  // wants sent differently gets a `toJSON`.
  const kept = (told: unknown): Kept | undefined => {
    if (!opts.carry) return undefined;
    // The listener's own value; only the optional data fields are read off it.
    const t = told as {
      input: { payload?: unknown };
      target: { context?: unknown };
      output?: { payload?: unknown };
    };
    const json = (v: unknown) => {
      if (v === undefined) return undefined;
      try {
        return JSON.parse(JSON.stringify(v)) as unknown;
      } catch {
        return undefined;
      }
    };
    const keep: Kept = {};
    const payload = json(t.input.payload);
    const context = json(t.target.context);
    const emitted = json(t.output?.payload);
    if (payload !== undefined) keep.payload = payload;
    if (context !== undefined) keep.context = context;
    if (emitted !== undefined) keep.emitted = emitted;
    return Object.keys(keep).length ? keep : undefined;
  };

  const off: (() => void)[] = [
    fsm.rx.on(TRANSITION, (t) => {
      // Converted at the wire: whatever the machine's label types, the wire carries strings.
      const edge: Row = {
        from: String(t.source.type),
        on: String(t.input.type),
        to: String(t.target.type),
        ...(t.output && { emit: String(t.output.type) }),
      };
      // Stamped here, where it happened. The page drawing this is somewhere else and its clock
      // would say when it heard, which is a fact about the network and not about the run.
      const keep = kept(t);
      const went: Went = { edge, t: Date.now(), ...(keep && { keep }) };
      // A step taken after walking back drops the future it was walked back from — the recorder
      // says where we are, and what came after that is a run that did not happen.
      if (past) steps.length = past.index - 1;
      steps.push(went);
      // The step, and where the machine now stands — which is not always the step's target: a
      // machine can be restored from outside, and the wire says what is, not what follows.
      link.send({ say: "step", who, went, at: String(fsm.state.type) });
    }),
    // A page asked who is out there: restate everything.
    link.rx.on("hear", (msg) => {
      if (!isWire(msg)) return;
      if (msg.say === "hail") return void hello();
      // A jump goes to the recorder; without one nothing happens. No reply here — the recorder's
      // own `moved` triggers the restated `hello`, for jumps from any side.
      if (msg.say === "jump" && msg.who === who) past?.jump(msg.step);
    }),
    // On every (re)connect, so an application started before the viewer does not wait to be asked.
    link.rx.on("open", hello),
    // `restore` publishes no transition, so the new position is restated on `moved`.
    ...(past ? [past.rx.on("moved", hello)] : []),
  ];
  hello();

  const leave = () => {
    link.send({ say: "bye", who });
    for (const it of off) it();
    if (own) drop(url);
  };
  leaving.add(leave);
  // A closing page sends `bye` itself; a Node process uses `close()` below.
  if (typeof addEventListener === "function")
    addEventListener("pagehide", leave, { once: true });

  return fsm;
}

/**
 * Send `bye` for every machine and close the sockets. Needed in Node: an open socket holds the
 * event loop, and the process would not exit. A browser tab does not need it.
 */
export function close(): void {
  for (const leave of [...leaving]) leave();
  leaving.clear();
}

/** How to say goodbye, one per machine being watched. */
const leaving = new Set<() => void>();

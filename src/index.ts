/**
 * @evgkch/fsmjs-inspector — the whole of what an application writes, and it is one word.
 *
 *   const cart = inspect(new StateMachine(schema, start), { name: "cart" });
 *
 * `inspect` gives the machine back. It is the identity function with a listener attached, so it
 * goes around an existing instance without moving a line of code and comes off by deleting six
 * characters — which is what a debugger's entry point has to be if it is going to be put in and
 * taken out of somebody's application all day.
 *
 * Nothing here draws. There is no document, no stylesheet and no figure in this file: the
 * inspector is a separate application, started separately, and what this does is tell it what is
 * happening. That is why it is the main entry — the thing being debugged may have no DOM at all,
 * and a server, a worker or a test run should not be importing a page to say what a machine did.
 *
 * What it sends is in `entities/machine/model/wire`, and it is names — the schema as
 * `JSON.stringify` writes it, and the four types of every transition. Contexts and payloads stay
 * in the process they belong to.
 *
 * Several machines in one application go over one socket. That is not an optimisation: the roster
 * on the other side is keyed by who said what, and one pipe is what makes "everyone, say what you
 * are" a single question with several answers.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { Edge } from "@evgkch/fsmjs";
import type { Graph } from "./entities/machine/model/graph.js";
import { isWire } from "./entities/machine/model/wire.js";
import { newSocket } from "./shared/api/link.js";
import type { Link } from "./shared/api/link.js";

/**
 * Any machine at all — said as what a publisher needs of one, and not as a `StateMachine` with its
 * type parameters filled in.
 *
 * A real application's machine carries real contexts and real payloads, and `StateMachine<Q, Σ, Λ>`
 * is invariant in all three: asking for the erased shape a dump has would refuse every machine
 * worth watching and send its owner looking for a cast. What is actually read is the name of the
 * state it is in and the channel it says its transitions on, so that is what is asked for.
 */
type Any = {
  readonly state: Named;
  readonly rx: {
    on(msg: typeof TRANSITION, hear: (t: Told) => void): () => boolean;
  };
};

/** A state or an event, as this file reads one: which of them it is. */
type Named = { readonly type: string };

/** A transition that happened, in the four names it is drawn from. */
type Told = {
  readonly source: Named;
  readonly input: Named;
  readonly target: Named;
  readonly output?: Named;
};

/**
 * Where the relay listens when nobody says otherwise.
 *
 * A port and not a guess: the viewer that comes with this package dials the same one, so cloning
 * the repository, running it, and putting one line in an application is the whole of the setup.
 */
export const RELAY = "ws://localhost:8999";

export type Options = {
  /** What to call it. An application has more than one machine and they are not alike. */
  name?: string;
  /**
   * A line about what it is for, written where you know the answer.
   *
   * The inspector shows the schema, and a schema says what a machine does and never what it is
   * for. `"the selection rectangle, from empty through drawing to ready"` is a sentence nobody can
   * work out from four states, and it is the difference between a roster of names and a roster.
   */
  description?: string;
  /** Where the inspector is listening, when it is not on this host. */
  url?: string;
  /** A pipe of your own — anything with the three functions on it. Then `url` is not used. */
  link?: Link;
};

/**
 * One socket per address, shared by every machine in this process and closed when the last of them
 * stops. Ten machines are ten publishers and one connection, and the relay sees one client saying
 * ten things about itself.
 */
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
 * Say what this machine is doing, and hand it back.
 *
 * The machine is returned so this can be written around an instance that already exists, in the
 * line that already declares it, and removed later without unpicking anything. It is not wrapped,
 * not proxied and not copied: what comes out is what went in, with one listener on its channel.
 */
export function inspect<T extends Any>(fsm: T, opts: Options = {}): T {
  const who = idOf();
  const name = opts.name ?? `machine ${count}`;
  const note = opts.description ?? "";
  const url = opts.url ?? RELAY;
  // A link handed in is the caller's to close; one dialled here is shared and refcounted.
  const own = !opts.link;
  const link = opts.link ?? dial(url);

  // The graph, taken the way the tool's own lede says it can be: a machine is a projection of
  // itself, and this is that projection.
  const graph = JSON.parse(JSON.stringify(fsm)) as Graph;
  const steps: Edge[] = [];

  const hello = () =>
    link.send({
      say: "hello",
      who,
      name,
      note,
      graph,
      at: fsm.state.type,
      steps,
    });

  const off: (() => void)[] = [
    fsm.rx.on(TRANSITION, (t) => {
      const edge: Edge = {
        from: t.source.type,
        on: t.input.type,
        to: t.target.type,
        ...(t.output && { emit: t.output.type }),
      };
      steps.push(edge);
      // The step, and where the machine now stands — which is not always the step's target: a
      // machine can be restored from outside, and the wire says what is, not what follows.
      link.send({ say: "step", who, edge, at: fsm.state.type });
    }),
    // Somebody has opened a page and does not know who is out there. Everything, restated: the
    // run so far is short, and a snapshot is what makes a lost message not a hole.
    link.rx.on("hear", (msg) => {
      if (isWire(msg) && msg.say === "hail") hello();
    }),
    // And every time the pipe comes up, including after it went away, so an application started
    // before the viewer does not wait to be asked.
    link.rx.on("open", hello),
  ];
  hello();

  const leave = () => {
    link.send({ say: "bye", who });
    for (const it of off) it();
    if (own) drop(url);
  };
  leaving.add(leave);
  // A page that goes away says goodbye on the way out. There is no handle to do it with, and that
  // is the point: `inspect` returns the machine, so the one line stays one line. What is left is
  // `close()`, for a process that has to end — see below.
  if (typeof addEventListener === "function")
    addEventListener("pagehide", leave, { once: true });

  return fsm;
}

/**
 * Let go of everything and let the process end.
 *
 * A browser tab needs this no more than it needs to close its own sockets, and it is not what the
 * one line is for. A script does: an open socket holds Node's event loop open, so a test run or a
 * task that watched a machine would sit there after its work was done, waiting on a debugger.
 */
export function close(): void {
  for (const leave of [...leaving]) leave();
  leaving.clear();
}

/** How to say goodbye, one per machine being watched. */
const leaving = new Set<() => void>();

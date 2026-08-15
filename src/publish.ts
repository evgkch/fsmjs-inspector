/**
 * @evgkch/fsmjs-inspector/publish — the other end of the wire, and the whole of what an
 * application has to do to be watched.
 *
 * One line beside a machine, and a page somewhere else draws it: `publish(fsm, { name: "cart" })`.
 * Nothing about it is a drawing, and nothing here touches a document — which is the reason this is
 * its own entry point rather than a function in the package's main one. The application being
 * debugged may have no DOM at all: a server, a worker, a test run. The inspector is a page; the
 * publisher is a listener.
 *
 * What it sends is in `entities/machine/model/wire`, and it is names — the schema as
 * `JSON.stringify` writes it, and the four types of every transition. Contexts and payloads stay
 * in the process they belong to.
 *
 * Several machines in one application publish over one socket. That is not an optimisation: the
 * viewer's roster is keyed by who said what, and one pipe is what makes "everyone, say what you
 * are" a single question with several answers.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { Edge, StateMachine } from "@evgkch/fsmjs";
import type { Ctx, Ev, Graph } from "./entities/machine/model/graph.js";
import { isWire } from "./entities/machine/model/wire.js";
import { newSocket } from "./shared/api/link.js";
import type { Link } from "./shared/api/link.js";

/** Any machine at all: the inspector reads labels and names, never types. */
type Any = StateMachine<Ctx, Ev, Ev>;

/**
 * Where the relay listens when nobody says otherwise.
 *
 * A port and not a guess: the viewer that comes with this package dials the same one, so cloning
 * the repository, running it, and putting one line in an application is the whole of the setup.
 */
export const RELAY = "ws://localhost:8999";

export type Options = {
  /** What to call it on screen. Applications have more than one machine, and they are not alike. */
  name?: string;
  /** Where the relay is, when it is not on this host. */
  url?: string;
  /** A pipe of your own — anything with the three functions on it. Then `url` is not used. */
  link?: Link;
};

export type Published = {
  /** Say goodbye and let go of the machine. It is left exactly as it was. */
  readonly stop: () => void;
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

export function publish(fsm: Any, opts: Options = {}): Published {
  const who = idOf();
  const name = opts.name ?? `machine ${count}`;
  const url = opts.url ?? RELAY;
  // A link handed in is the caller's to close; one dialled here is shared and refcounted.
  const own = !opts.link;
  const link = opts.link ?? dial(url);

  // The graph, taken the way the tool's own lede says it can be: a machine is a projection of
  // itself, and this is that projection.
  const graph = JSON.parse(JSON.stringify(fsm)) as Graph;
  const steps: Edge[] = [];

  const hello = () =>
    link.send({ say: "hello", who, name, graph, at: fsm.state.type, steps });

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
    link.on((msg) => {
      if (isWire(msg) && msg.say === "hail") hello();
    }),
    // And every time the pipe comes up, including after it went away, so an application started
    // before the viewer does not wait to be asked.
    link.open(hello),
  ];
  hello();

  return {
    stop: () => {
      link.send({ say: "bye", who });
      for (const it of off) it();
      if (own) drop(url);
    },
  };
}

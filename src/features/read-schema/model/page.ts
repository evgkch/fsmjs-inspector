/**
 * The page's own machine — the library running the page that explains it.
 *
 * Two machines live on this page and they are not the same kind of thing. The one in the figure
 * is data: a graph read back from JSON, every operation reduced to a name, driven by clicks.
 * This one is code: three states, real guards, real `with`, and two output events the DOM
 * listens to. So what happens when the text in the editor changes is not a chain of ifs but a
 * cell of two rules — the first applies when the text parsed, the second is what is left.
 *
 * The three states carry different things, which is the reason there are three of them. `ready`
 * carries the graph on screen and the state it runs from; `broken` carries the parser's
 * complaint and, if there ever was one, the last graph that worked. That last field is why a
 * half-typed brace does not blank the figure: the schema shown is still the last one that
 * parsed, and entering `broken` from `blank` cannot pretend otherwise, because there is nothing
 * to carry over and the type says so.
 */
import { StateMachine, nodes } from "@evgkch/fsmjs";
import type { FsmState, IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";
import type { Graph } from "../../../entities/machine/index.js";
import type { Written } from "../../../shared/lang/rules.js";

/**
 * What the figure is drawing: a graph, the state its run starts from, and where every rule of it
 * was written. The last of those is what makes the text beside the figure a source rather than an
 * input box — and it belongs here, with the graph, because the two are one reading of one text.
 */
export type Shown = { graph: Graph; start: string; rules: readonly Written[] };

export type Q = Merge<
  | IState<"blank">
  | IState<"ready", Shown>
  | IState<
      "broken",
      { message: string; line: number | null; last: Shown | null }
    >
>;

/**
 * The parsing is done by the caller and its outcome arrives as the payload, so the guard stays
 * a question about the input rather than a second attempt at it.
 */
export type In = Merge<
  | IEvent<
      "parsed",
      {
        graph: Graph | null;
        rules: readonly Written[];
        message: string;
        /** Which line the complaint is about, when it is about one. */
        line: number | null;
        keep: string;
      }
    >
  | IEvent<"begin", { start: string }>
>;

export type Out = Merge<
  | IEvent<"built", Shown>
  | IEvent<"stopped", { message: string; line: number | null }>
>;

/** The one guard: did the editor's text parse. */
const readable = (_: unknown, p: { graph: Graph | null }) => p.graph !== null;

/** Keep running from the same state when the edited graph still has it, else from the first. */
const from = (graph: Graph, keep: string, rules: readonly Written[]): Shown => {
  const all = nodes(graph);
  return { graph, start: all.includes(keep) ? keep : (all[0] ?? ""), rules };
};

// The guard has already decided by the time `with` runs — that split is what the pair of words
// is for, and it is why the cast here states a fact rather than a hope.
const adopt = (
  _: unknown,
  p: { graph: Graph | null; keep: string; rules: readonly Written[] },
): Shown => from(p.graph as Graph, p.keep, p.rules);

const made = ({ graph, start, rules }: Shown): Shown => ({
  graph,
  start,
  rules,
});
const told = ({ message, line }: { message: string; line: number | null }) => ({
  message,
  line,
});

// Named, like everything else here: a dump keeps the name of an operation and none of its code,
// and this machine's dump is one of the schemas the page offers.
type Broke = { message: string; line: number | null };

const first = (_: unknown, p: Broke) => ({ ...p, last: null });
const keep = (c: Shown, p: Broke) => ({ ...p, last: c });
const still = (c: { last: Shown | null }, p: Broke) => ({ ...p, last: c.last });
const begun = (c: Shown, p: { start: string }) => ({
  graph: c.graph,
  start: p.start,
  rules: c.rules,
});

const schema: Schema<Q, In, Out> = {
  blank: {
    parsed: [
      { to: "ready", when: readable, with: adopt, emit: "built", by: made },
      { to: "broken", with: first, emit: "stopped", by: told },
    ],
  },
  ready: {
    parsed: [
      { to: "ready", when: readable, with: adopt, emit: "built", by: made },
      // Leaving `ready` is the one transition that has somewhere to put the graph it is
      // leaving, and the only reason the figure survives a typo.
      { to: "broken", with: keep, emit: "stopped", by: told },
    ],
    begin: [{ to: "ready", with: begun, emit: "built", by: made }],
  },
  broken: {
    parsed: [
      { to: "ready", when: readable, with: adopt, emit: "built", by: made },
      { to: "broken", with: still, emit: "stopped", by: told },
    ],
  },
};

export const page = new StateMachine<Q, In, Out>(schema, {
  type: "blank",
  context: undefined,
});

/** The graph on screen, whichever state the page is in — `broken` still shows the last good one. */
export const shown = (at: FsmState<Q>): Shown | null =>
  at.type === "ready"
    ? at.context
    : at.type === "broken"
      ? at.context.last
      : null;

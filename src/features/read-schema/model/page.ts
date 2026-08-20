/**
 * The page's own machine: what the editor's text parses to. `ready` carries the graph on screen
 * and its start; `broken` carries the parser's complaint and the last graph that worked — which
 * is why a half-typed brace does not blank the figure. `broken` entered from `blank` has nothing
 * to carry, and the type says so.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { FsmState, IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";
import type { Graph } from "../../../entities/machine/index.js";
import type { Written } from "../../../shared/lang/rules.js";
import { startOf } from "./reading.js";
import type { Shown } from "./reading.js";

export type Q = Merge<
  | IState<"blank">
  | IState<"ready", Shown>
  | IState<
      "broken",
      { message: string; line: number | null; last: Shown | null }
    >
>;

/** Parsing is the caller's; its outcome arrives as the payload, and the guard reads it. */
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

type Broke = { message: string; line: number | null };

const schema: Schema<Q, In, Out> = {
  blank: {
    parsed: [
      { when: readable, to: ["ready", adopt], emit: ["built", made] },
      { to: ["broken", first], emit: ["stopped", told] },
    ],
  },
  ready: {
    parsed: [
      { when: readable, to: ["ready", adopt], emit: ["built", made] },
      // The one transition with a graph to keep — why the figure survives a typo.
      { to: ["broken", keep], emit: ["stopped", told] },
    ],
    begin: [{ to: ["ready", begun], emit: ["built", made] }],
  },
  broken: {
    parsed: [
      { when: readable, to: ["ready", adopt], emit: ["built", made] },
      { to: ["broken", still], emit: ["stopped", told] },
    ],
  },
};

export const page = new StateMachine<Q, In, Out>(schema, {
  type: "blank",
  context: undefined,
});

/** The graph on screen, whichever state the page is in — `broken` still shows the last good one. */
export function shown(at: FsmState<Q>): Shown | null {
  return at.type === "ready"
    ? at.context
    : at.type === "broken"
      ? at.context.last
      : null;
}

// ── the operations, declared after the schema that names them ────────────────

/** The one guard: did the editor's text parse. */
function readable(_: unknown, p: { graph: Graph | null }): boolean {
  return p.graph !== null;
}

/** Keep running from the same state when the edited graph still has it, else from the first. */
function from(graph: Graph, keep: string, rules: readonly Written[]): Shown {
  return { graph, start: startOf(graph, keep), rules };
}

// By the time `with` runs the guard has decided, so the cast states a fact.
function adopt(
  _: unknown,
  p: { graph: Graph | null; keep: string; rules: readonly Written[] },
): Shown {
  return from(p.graph as Graph, p.keep, p.rules);
}

function made({ graph, start, rules }: Shown): Shown {
  return { graph, start, rules };
}

function told({ message, line }: Broke): Broke {
  return { message, line };
}

function first(_: unknown, p: Broke): Broke & { last: null } {
  return { ...p, last: null };
}

function keep(c: Shown, p: Broke): Broke & { last: Shown } {
  return { ...p, last: c };
}

function still(
  c: { last: Shown | null },
  p: Broke,
): Broke & { last: Shown | null } {
  return { ...p, last: c.last };
}

function begun(c: Shown, p: { start: string }): Shown {
  return { graph: c.graph, start: p.start, rules: c.rules };
}

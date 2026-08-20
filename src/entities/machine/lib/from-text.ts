/**
 * A subject built from a dump: a real machine made from the graph. A dump keeps guard names
 * without code, so every `when` would read as ⊤ and only the first rule of a cell could fire.
 * `guarded` gives each rule a real guard instead — "is this the rule that was named" — so naming
 * a rule is what makes it fire.
 */
import { StateMachine, TRANSITION } from "@evgkch/fsmjs";
import type { Off } from "@evgkch/fsmjs";
import { history, log, rules } from "@evgkch/fsmjs/debug";
import type { History } from "@evgkch/fsmjs/debug";
import type { Ctx, Ev, Graph, Step } from "../model/graph.js";
import { partsOf, ruleId } from "../model/rule.js";
import type { RuleId } from "../model/rule.js";
import type { Change, Subject } from "../model/subject.js";

/** One transition, with the line `rules` wrote for it — shown by the history on hover. */
export type Told = Step & { line: string };

export type Text = Subject;

export function fromText(graph: Graph, start: string): Text {
  /** Which rule the machine is being asked to take, while it is being asked. Null the rest. */
  let taking: RuleId | null = null;

  const guarded = (): Graph => {
    const out: Record<string, Record<string, unknown[]>> = {};
    for (const [q, cells] of Object.entries(graph)) {
      if (cells === null || typeof cells !== "object") continue;
      const byEvent: Record<string, unknown[]> = (out[q] = {});
      for (const [σ, list] of Object.entries(cells)) {
        if (!Array.isArray(list)) continue;
        byEvent[σ] = list.map((rule: unknown, i: number) => ({
          ...(rule as object),
          when: () => taking === null || taking === ruleId(q, σ, i),
        }));
      }
    }
    return out;
  };

  // The constructor wants a typed schema; this one was parsed at run time, and its types are
  // precisely the ones JSON dropped. The cast states that and claims nothing else.
  const fsm = new StateMachine<Ctx, Ev, Ev>(guarded() as never, {
    type: start,
    context: undefined,
  });

  const past: History<Ctx> = history(fsm);
  const steps: Told[] = [];
  const watchers = new Set<(what: Change) => void>();
  const say = (what: Change) => {
    for (const on of watchers) on(what);
  };

  const off: Off[] = [
    log(
      fsm,
      rules<Ctx, Ev, Ev>((line, t) => {
        // `history` subscribed first, so by now its index already points at the state this
        // transition reached. Cutting the array to it drops the redo future here exactly as the
        // dispatch dropped it there, which keeps one step per recorded state.
        steps.length = past.index - 1;
        steps.push(Object.assign(t, { line }));
      }),
    ),
    // Silent while a rule is being taken: with `taking` set, the guards answer "which rule was
    // named", and a redraw at that moment would read a machine where nothing can fire.
    fsm.rx.on(TRANSITION, () => {
      if (taking === null) say({ say: "step" });
    }),
  ];

  return {
    get graph() {
      return graph;
    },
    get at() {
      return fsm.state.type;
    },
    get steps() {
      return steps;
    },
    get step() {
      return past.index;
    },
    drive: {
      // A rule fires from where the machine stands when it is the first of its cell to pass its
      // guard — which is what `can` answers and what `take` will then do.
      can: (rule) => {
        const { from, on } = partsOf(rule);
        return fsm.state.type === from && fsm.can(on as never);
      },
      take: (rule) => {
        const { on } = partsOf(rule);
        taking = rule;
        try {
          fsm.dispatch(on as never);
        } finally {
          taking = null;
        }
        // Now, with the naming over and the machine standing where it ended up.
        say({ say: "step" });
      },
    },
    rewind: (step) => {
      past.jump(step);
      say({ say: "rewind", step });
    },
    watch: (on) => {
      watchers.add(on);
      return () => watchers.delete(on);
    },
    stop: () => {
      for (const it of off) it();
      past.stop();
      watchers.clear();
    },
  };
}

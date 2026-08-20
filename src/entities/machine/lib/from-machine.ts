/**
 * A subject over a machine already running. The graph is the machine's own dump; steps come off
 * its transition channel. This subject cannot choose which rule of a cell applies — the guards
 * are real code — so `take` sends the event, and whichever rule the guards pass is what fires.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { AnyMachine, Off } from "@evgkch/fsmjs";
import type { Graph, Step } from "../model/graph.js";
import { partsOf } from "../model/rule.js";
import type { Change, Subject } from "../model/subject.js";

/** Any machine at all: the inspector reads labels and names, never types. */
type Any = AnyMachine;

export type Options = {
  /** A recorder from `history(fsm)` (`@evgkch/fsmjs/debug`); passing one turns rewinding on. */
  history?: Past;
};

/** A recorder, by its shape: what this uses of one, and nothing about what it records. */
export type Past = {
  readonly index: number;
  jump(index: number): boolean;
  readonly rx: { on(msg: "moved", hear: (i: number) => void): () => boolean };
  stop(): void;
};

export function fromMachine(fsm: Any, opts: Options = {}): Subject {
  // The machine's own dump is its graph.
  const graph = JSON.parse(JSON.stringify(fsm)) as Graph;

  const steps: Step[] = [];
  const watchers = new Set<(what: Change) => void>();
  const say = (what: Change) => {
    for (const on of watchers) on(what);
  };

  const past = opts.history ?? null;

  const off: Off[] = [
    // `moved` fires only on jump/undo/redo — a fired transition records silently — so this and
    // the transition listener below never fire for the same event.
    ...(past
      ? [past.rx.on("moved", (i) => say({ say: "rewind", step: i }))]
      : []),
    fsm.rx.on(TRANSITION, (t) => {
      // `history` subscribed first, so its index already points at the reached state; cutting to
      // it drops the redo future the same way.
      if (past) steps.length = past.index - 1;
      steps.push(t as Step);
      say({ say: "step" });
    }),
  ];

  return {
    graph,
    // The tool works with string names; the machine's state type may be any `PropertyKey`.
    get at() {
      return String(fsm.state.type);
    },
    get steps() {
      return steps;
    },
    // With nothing recording, the machine is always at the end of what happened.
    get step() {
      return past ? past.index : steps.length;
    },
    drive: {
      can: (rule) => {
        const { from, on } = partsOf(rule);
        return fsm.state.type === from && fsm.can(on as never);
      },
      // Sends the event only; which rule of the cell takes it is the machine's guards' decision.
      take: (rule) => void fsm.dispatch(partsOf(rule).on as never),
    },
    // The recorder reports every move via `moved`, including moves made by the application.
    ...(past && { rewind: (step: number) => void past.jump(step) }),
    watch: (on) => {
      watchers.add(on);
      return () => watchers.delete(on);
    },
    // Unsubscribes and leaves the machine as it was.
    stop: () => {
      for (const it of off) it();
      past?.stop();
      watchers.clear();
    },
  };
}

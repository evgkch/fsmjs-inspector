/**
 * A subject that is a machine already running — the difference between a demonstration and a
 * debugger.
 *
 * Nothing is built here and nothing is parsed. The graph comes from the machine itself, because
 * `JSON.stringify` of a machine *is* its graph — the claim the whole tool rests on, used rather
 * than described. Where it stands is where it stands. What has happened is what the machine said
 * happened, on the channel it says it on.
 *
 * What this subject cannot do is choose which rule of a cell applies. Those guards are real code
 * in somebody's program; the inspector can send the event and watch. So `take` sends, and the
 * rule that fires is whichever one the machine's own guards let through — which may not be the
 * one that was pressed, and seeing that is the point of pointing the tool at a live machine.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { Off, StateMachine } from "@evgkch/fsmjs";
import { history } from "@evgkch/fsmjs/debug";
import type { History } from "@evgkch/fsmjs/debug";
import type { Ctx, Ev, Graph, Step, Subject } from "../subject.js";

/** Any machine at all: the inspector reads labels and names, never types. */
type Any = StateMachine<Ctx, Ev, Ev>;

export type Options = {
  /**
   * Record where the machine has been, so the history can be walked. It costs a `restore` per
   * step back and it moves somebody else's machine, so it is asked for rather than assumed.
   */
  rewind?: boolean;
};

export function fromMachine(fsm: Any, opts: Options = {}): Subject {
  // The graph, taken the way the tool's own lede says it can be: a machine is a projection of
  // itself, and this is that projection.
  const graph = JSON.parse(JSON.stringify(fsm)) as Graph;

  const steps: Step[] = [];
  const watchers = new Set<() => void>();
  const changed = () => {
    for (const on of watchers) on();
  };

  const past: History<Ctx> | null = opts.rewind ? history(fsm) : null;

  const off: Off[] = [
    fsm.rx.on(TRANSITION, (t) => {
      // `history` subscribed first when there is one, so its index already points at the state
      // this transition reached, and cutting to it drops a redo future the same way.
      if (past) steps.length = past.index - 1;
      steps.push(t as Step);
      changed();
    }),
  ];

  return {
    graph,
    get at() {
      return fsm.state.type;
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
        const [from, on] = rule.split("\0");
        return fsm.state.type === from && fsm.can(on as never);
      },
      // The event, and nothing more. Which rule of the cell takes it is the machine's to decide,
      // and what it decided arrives back as a step.
      take: (rule) => void fsm.dispatch(rule.split("\0")[1] as never),
    },
    ...(past && {
      rewind: (step: number) => {
        past.jump(step);
        changed();
      },
    }),
    watch: (on) => {
      watchers.add(on);
      return () => watchers.delete(on);
    },
    // Somebody else's machine: the subject lets go of it and leaves it exactly as it was.
    stop: () => {
      for (const it of off) it();
      past?.stop();
      watchers.clear();
    },
  };
}

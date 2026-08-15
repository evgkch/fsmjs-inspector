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
import type { AnyMachine, Off } from "@evgkch/fsmjs";
import type { Graph, Step } from "../model/graph.js";
import { partsOf } from "../model/rule.js";
import type { Change, Subject } from "../model/subject.js";

/**
 * Any machine at all: the inspector reads labels and names, never types.
 *
 * `AnyMachine` is the library's own word for that now. It used to be `StateMachine<Ctx, Ev, Ev>` —
 * the erased shape a dump has — which is the one shape a real application's machine is never in,
 * so every caller with a machine worth watching had to cast.
 */
type Any = AnyMachine;

export type Options = {
  /**
   * A recorder you already have — `history(fsm)` from `@evgkch/fsmjs/debug` — and handing it over
   * is the whole of turning rewinding on.
   *
   * Not a flag, for the same reason `inspect` does not take one: a flag would mean this calling
   * `history(fsm)` on somebody's behalf, and then the line that switches the tool off is also the
   * line that removes a recorder their undo may have been using. It also cannot be a flag any
   * more, honestly — recording needs a machine that can be restored, and what is read here is any
   * machine at all.
   */
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
  // The graph, taken the way the tool's own lede says it can be: a machine is a projection of
  // itself, and this is that projection.
  const graph = JSON.parse(JSON.stringify(fsm)) as Graph;

  const steps: Step[] = [];
  const watchers = new Set<(what: Change) => void>();
  const say = (what: Change) => {
    for (const on of watchers) on(what);
  };

  const past = opts.history ?? null;

  const off: Off[] = [
    // The recorder says `moved` only when it is walked back or forward — a `jump`, `undo`, `redo`.
    // A fired transition records silently, so this and the transition below cannot both fire for
    // the same event, which is what makes the two kinds of change tellable apart.
    ...(past
      ? [past.rx.on("moved", (i) => say({ say: "rewind", step: i }))]
      : []),
    fsm.rx.on(TRANSITION, (t) => {
      // `history` subscribed first when there is one, so its index already points at the state
      // this transition reached, and cutting to it drops a redo future the same way.
      if (past) steps.length = past.index - 1;
      steps.push(t as Step);
      say({ say: "step" });
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
        const { from, on } = partsOf(rule);
        return fsm.state.type === from && fsm.can(on as never);
      },
      // The event, and nothing more. Which rule of the cell takes it is the machine's to decide,
      // and what it decided arrives back as a step.
      take: (rule) => void fsm.dispatch(partsOf(rule).on as never),
    },
    // Told, not assumed: the recorder says `moved` whenever it moves the machine, including when
    // something other than this walked it back, so there is nothing to remember to redraw after.
    ...(past && { rewind: (step: number) => void past.jump(step) }),
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

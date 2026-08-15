/**
 * What the inspector inspects — the one seam the whole tool turns on.
 *
 * The figure needs exactly this much about a machine: the graph, to draw; where it stands, to
 * mark; what has happened, to list; a way to move it, if it can be moved; and a way back through
 * what has happened, if anything is recording it. Nothing else. So that is an interface, and
 * every way of getting at a machine is an implementation of it:
 *
 *   fromText(graph, start)   a dump in an editor        — the page
 *   fromMachine(fsm)         a machine that is running  — `inspect(fsm)`, anywhere
 *
 * The figure is written against `Subject` and never learns which one it got.
 */
import type { Off } from "@evgkch/fsmjs";
import type { Graph, Step } from "./graph.js";
import type { RuleId } from "./rule.js";

/**
 * Moving the machine — and the two kinds of subject differ here, which is the whole of what makes
 * one a demonstration and the other a debugger.
 *
 * On a dump the naming is exact: the guards were lost with the code, the inspector puts its own
 * back, and naming a rule is what makes that rule fire. On a machine that is running the guards
 * are real code. The inspector can send the event; it cannot decide which rule of the cell
 * applies, and must not pretend to — so you press an outcome and watch the machine take a
 * different one. That is not a shortcoming of the tool, it is the thing you opened it to see.
 */
export type Drive = {
  /** Would this rule's event move the machine at all, from where it stands. */
  can: (rule: RuleId) => boolean;
  /** Send it. What actually happens is the machine's business, and shows up in `steps`. */
  take: (rule: RuleId) => void;
};

export type Subject = {
  /** What to draw: the graph, the way `JSON.stringify(machine)` writes one. */
  readonly graph: Graph;

  /** Where the machine stands, or `""` when no machine stands anywhere. */
  readonly at: string;

  /** What has happened, oldest first. Rewinding does not unwrite one. */
  readonly steps: readonly Step[];

  /**
   * When each of them happened, in epoch milliseconds, index for index with `steps`.
   *
   * Beside the steps rather than inside them: a `Step` is the library's own `Transition` and this
   * is not part of one — the machine says what happened, not when, because when is a fact about
   * the process it happened in and not about the relation.
   *
   * That is also why it crosses the wire. A machine being watched from another page took its steps
   * over there, and stamping them with the reader's clock would say the run happened when the page
   * happened to hear about it.
   */
  readonly times: readonly number[];

  /** Where in `steps` the machine stands: 0 before the first, k after `steps[k - 1]`. */
  readonly step: number;

  /** Absent when there is nothing to move. */
  readonly drive?: Drive;

  /** Go back to a step. Absent when nothing is recording one. */
  readonly rewind?: (step: number) => void;

  /** Called whenever any of the above has changed. Returns the way to stop being called. */
  readonly watch: (on: () => void) => Off;

  /** Let go of whatever this subject is holding: listeners, a history, a machine of its own. */
  readonly stop: () => void;
};

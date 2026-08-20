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
 * Moving the machine. On a dump, naming a rule fires exactly that rule (the inspector's own
 * guards). On a running machine the guards are real code: the inspector sends the event, and the
 * rule that fires may differ from the one pressed.
 */
export type Drive = {
  /** Would this rule's event move the machine at all, from where it stands. */
  can: (rule: RuleId) => boolean;
  /** Send it. What actually happens is the machine's business, and shows up in `steps`. */
  take: (rule: RuleId) => void;
};

/**
 * What changed, told apart because the redraws cost differently: `step` — the run grew by one
 * (append a column); `rewind` — the machine was walked to another slice (move the mark);
 * `restore` — the whole run was restated (rebuild).
 */
export type Change =
  { say: "step" } | { say: "rewind"; step: number } | { say: "restore" };

export type Subject = {
  /** What to draw: the graph, the way `JSON.stringify(machine)` writes one. */
  readonly graph: Graph;

  /** Where the machine stands, or `""` when no machine stands anywhere. */
  readonly at: string;

  /** What has happened, oldest first. Rewinding does not unwrite one. */
  readonly steps: readonly Step[];

  /** Where in `steps` the machine stands: 0 before the first, k after `steps[k - 1]`. */
  readonly step: number;

  /** Absent when there is nothing to move. */
  readonly drive?: Drive;

  /** Go back to a step. Absent when nothing is recording one. */
  readonly rewind?: (step: number) => void;

  /** Called whenever any of the above has changed. Returns the way to stop being called. */
  readonly watch: (on: (what: Change) => void) => Off;

  /** Let go of whatever this subject is holding: listeners, a history, a machine of its own. */
  readonly stop: () => void;
};

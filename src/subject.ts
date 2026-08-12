/**
 * What the inspector inspects — the one seam the whole tool turns on.
 *
 * The figure needs exactly four things about a machine: the graph, to draw; where it stands, to
 * mark; what has happened, to list; and a way to move it, if it can be moved. Nothing else. So
 * that is an interface, and every way of getting at a machine is an implementation of it:
 *
 *   fromText(json)      a dump in a textarea      — the page, as it is today
 *   fromMachine(fsm)    a machine in this tab     — `inspect(fsm)`, embedded anywhere
 *   fromBridge(port)    a machine in another tab  — the devtools panel, over a port
 *
 * The figure is written against `Subject` and never learns which one it got.
 */
import type { Off, Transition } from "@evgkch/fsmjs";
import type { Graph } from "./page.js";

/** A rule, as the guards name it: its cell, and its place in that cell. */
export type RuleId = string;

/** One transition, in the only shape the figure reads it in. */
export type Step = Transition<
  Record<string, undefined>,
  Record<string, void>,
  Record<string, void>
>;

export type Subject = {
  /** What to draw: the graph, the way `JSON.stringify(machine)` writes one. */
  readonly graph: Graph;

  /** Where the machine stands, or `""` when no machine stands anywhere. */
  readonly at: string;

  /** What has happened, oldest first. */
  readonly steps: readonly Step[];

  /**
   * Take a named rule — and the two kinds of subject differ here, which is the whole of what
   * makes one a demonstration and the other a debugger.
   *
   * On a dump the naming is exact: the guards were lost with the code, the inspector put its own
   * back, and naming a rule is what makes that rule fire. On a live machine the guards are real
   * code. The inspector can send the event; it cannot decide which rule of the cell applies, and
   * must not pretend to — so you press an outcome and watch the machine take a different one.
   * That is not a shortcoming of the tool, it is the thing you opened the tool to see.
   *
   * Absent when there is no machine to move at all.
   */
  readonly send?: (rule: RuleId) => void;

  /** Go back to a step. Absent when nothing is recording one. */
  readonly jump?: (step: number) => void;

  /** Called whenever any of the above has changed. */
  readonly watch: (on: () => void) => Off;
};

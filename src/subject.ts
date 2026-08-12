/**
 * What the inspector inspects — the one seam the whole tool turns on.
 *
 * The figure needs exactly this much about a machine: the graph, to draw; where it stands, to
 * mark; what has happened, to list; a way to move it, if it can be moved; and a way back through
 * what has happened, if anything is recording it. Nothing else. So that is an interface, and
 * every way of getting at a machine is an implementation of it:
 *
 *   fromText(graph, start)   a dump in a textarea       — the page
 *   fromMachine(fsm)         a machine that is running  — `inspect(fsm)`, anywhere
 *
 * The figure is written against `Subject` and never learns which one it got.
 */
import type { Off, Transition } from "@evgkch/fsmjs";

/** A schema read back from JSON: labels, and the name of every operation that was there. */
export type Graph = Record<string, unknown>;

/**
 * What JSON leaves of the three carriers: no state carries a context, no event carries a
 * payload. That is not a simplification made for the inspector. It is what a dumped schema is,
 * and it is the reason a machine can be built from one at all.
 */
export type Ctx = Record<string, undefined>;
export type Ev = Record<string, void>;

/** One transition, in the only shape the figure reads it in. */
export type Step = Transition<Ctx, Ev, Ev>;

/** A rule, as the guards name it: its cell, and its place in that cell. */
export type RuleId = string;

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

/**
 * Which rule this is, as the guards name it: its cell, and its place in it. `edges` flattens a
 * cell in the order the schema wrote it, so the index here is that index.
 */
export const idOf = (
  all: readonly { from: string; on: string }[],
  r: { from: string; on: string },
): RuleId => {
  const cell = all.filter((e) => e.from === r.from && e.on === r.on);
  return `${r.from}\0${r.on}\0${Math.max(0, cell.indexOf(r as never))}`;
};

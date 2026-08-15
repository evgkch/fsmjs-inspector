/**
 * A run, read as what it actually was: the same transition taken twice in a row is one thing that
 * happened twice, not two things.
 *
 * A drag is one rule fired per pointer sample. Sixty of them are sixty slices of a run and one
 * fact, and a picture that gives each of them a column is a picture whose ends cannot both be
 * reached — the interesting step is a screen and a half back, and the reader is scrolling through
 * a fact they already understood. Folded, the same drag is one curve with `×60` under it, and a
 * long session stays a thing you can look at whole.
 *
 * Two in a row is enough to fold. Not three: at two the count is already the shorter statement,
 * and a rule that starts at three has to be explained to whoever sees two identical columns beside
 * one folded pair.
 *
 * What is folded is *consecutive* and *identical*: the same rule, taken from the same state to the
 * same state, on the same event, emitting the same letter. Two different rules that happen to join
 * the same pair of states are not the same transition and are never folded together — the history
 * already cannot say which rule of a cell was taken, and folding would make that worse rather than
 * shorter.
 */
import type { Edge } from "@evgkch/fsmjs";

export type Fold = {
  readonly edge: Edge;
  /** How many times in a row. One unless it repeated. */
  readonly count: number;
  /** Which step this began at, counting from one, as the run counts its steps. */
  readonly first: number;
  /** Which step it ended at. The same as `first` when it happened once. */
  readonly last: number;
};

export function folds(steps: readonly Edge[]): Fold[] {
  const out: Fold[] = [];
  for (const [i, edge] of steps.entries()) {
    const back = out[out.length - 1];
    if (back && same(back.edge, edge))
      out[out.length - 1] = { ...back, count: back.count + 1, last: i + 1 };
    else out.push({ edge, count: 1, first: i + 1, last: i + 1 });
  }
  return out;
}

/** Which fold a step is inside, or -1 — the one question the drawings ask backwards. */
export function foldAt(list: readonly Fold[], step: number): number {
  return list.findIndex((f) => step >= f.first && step <= f.last);
}

const same = (a: Edge, b: Edge) =>
  a.from === b.from && a.on === b.on && a.to === b.to && a.emit === b.emit;

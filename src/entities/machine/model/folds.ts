/**
 * Consecutive identical transitions folded into one entry with a count — a drag of sixty pointer
 * samples becomes one fold of ×60, and a long run stays viewable whole. Only consecutive and
 * identical steps fold (same from, on, to, emit); how a fold is drawn is the history's business.
 */
import type { Row } from "../../../shared/lang/rules.js";

export type Fold = {
  readonly edge: Row;
  /** How many times in a row. One unless it repeated. */
  readonly count: number;
  /** Which step this began at, counting from one, as the run counts its steps. */
  readonly first: number;
  /** Which step it ended at. The same as `first` when it happened once. */
  readonly last: number;
};

export function folds(steps: readonly Row[]): Fold[] {
  const out: Fold[] = [];
  for (const [i, edge] of steps.entries()) {
    const back = out[out.length - 1];
    if (back && same(back.edge, edge))
      out[out.length - 1] = { ...back, count: back.count + 1, last: i + 1 };
    else out.push({ edge, count: 1, first: i + 1, last: i + 1 });
  }
  return out;
}

const same = (a: Row, b: Row) =>
  a.from === b.from && a.on === b.on && a.to === b.to && a.emit === b.emit;

/**
 * Everything the figure is drawn from, read off the schema once — the three blocks, their axes,
 * and which cells hold what. Nothing here is a selection, and nothing analyses the graph itself:
 * `analysis` answers reachability, `edges` flattens the schema, `lanes` fixes the order.
 */
import { edges } from "@evgkch/fsmjs";
import { analyze } from "@evgkch/fsmjs/analysis";
import { flaws, hue, idOf, lanes } from "../../../entities/machine/index.js";
import type {
  Graph,
  RuleId,
  Subject,
} from "../../../entities/machine/index.js";
import { canFire } from "../../../features/take-rule/index.js";
import { CELL, EM, HEAD } from "../../../shared/lib/grid.js";
import { rowOf } from "../../../shared/lang/rules.js";
import type { Row } from "../../../shared/lang/rules.js";

/** Between the band of names stood on end and the block that hangs under it. */
const DROP = 16;

/** Between the grid and the words stood on end under it. */
const GAP = 8;

/** Width per letter of the TO/EMIT keywords down the right-hand edge. */
const KEY = 6;

/**
 * The grid the three blocks stand on: `on` gives block 1's columns, `q` the columns blocks 2 and
 * 3 share, `λ` block 3's rows, `row` the rows blocks 1 and 2 share. The row index is written down
 * the middle; the column index in one band under the grid, with block 3 under that — between the
 * two blocks that share it. Above the grid is one line of constant height, `HEAD`, for the four
 * index keywords.
 */
export type Geo = {
  names: number;
  spine: number;
  head: number;
  /** Under the last row of the grid, where its rails stop. */
  grid: number;
  /** Where the band of column names stood on end begins. */
  stem: number;
  /** Under that band. Block 3 hangs off this. */
  foot: number;
  /** Right of the columns, where `TO` and `EMIT` stand, each beside what it is the name of. */
  verge: number;
  width: number;
  bottom: number;
  on: (i: number) => number;
  q: (i: number) => number;
  λ: (i: number) => number;
  row: (j: number) => number;
};

function geometry(all: string[], outs: string[], evs: string[]): Geo {
  const w = (s: string) => s.length * EM;
  // One column of names down the middle, where blocks 1 and 2 meet: it labels the rows of the
  // one from its right and the rows of the other from its left, which is what a shared index
  // looks like when it is drawn once instead of twice.
  const wide = 22 + Math.max(30, ...all.map(w), ...outs.map(w));
  const left = 6;
  const spine = left + evs.length * CELL;
  const mid = spine + wide;
  const grid = HEAD + all.length * CELL;
  // The one band of column names, holding both indices: the events under block 1 and the states
  // under block 2, stood on end, as deep as the longest word of either.
  const stem = grid + GAP;
  const foot = stem + Math.max(0, ...all.map(w), ...evs.map(w));
  // Past the last column: TO against the names, EMIT against the outputs under them.
  const verge = mid + all.length * CELL + 10;
  return {
    names: spine + wide / 2,
    spine,
    head: HEAD,
    grid,
    stem,
    foot,
    verge,
    width: verge + (outs.length ? 4 : 2) * KEY + 6,
    bottom: (outs.length ? foot + DROP + outs.length * CELL : foot) + 8,
    on: (i) => left + i * CELL + CELL / 2,
    q: (i) => mid + i * CELL + CELL / 2,
    λ: (i) => foot + DROP + i * CELL + CELL / 2,
    row: (j) => HEAD + j * CELL,
  };
}

export type Draw = {
  all: string[];
  /**
   * The states again, reversed — the column order of blocks 2 and 3. Lanes and colours stay;
   * the reversal puts (q, q) on the other diagonal, so the two indices meet at the corner.
   */
  cols: string[];
  evs: string[];
  outs: string[];
  geo: Geo;
  here: string;
  off: Set<string>; // states no run can reach from the start
  rows: Row[];
  hue: (state: string) => string;
  cell: Map<string, Row[]>; // from ╳ on — block 1
  pair: Map<string, Row[]>; // from ╳ to — block 2
  shot: Map<string, Row[]>; // emit ╳ to — block 3
  far: Set<string>; // from ╳ to — reachable, but not in one step
  id: (r: Row) => RuleId; // which rule this is, as the guards name it
  /**
   * Whether taking is on offer at all — true only for a running machine that can be driven.
   * Exploring has nothing to be out of reach of; a watched machine is not dimmed either, since
   * its reach is not the reader's to use.
   */
  acting: boolean;
  fires: (row: Row) => boolean; // could the machine take it from where it stands
  dead: (row: Row) => boolean; // dead in the dump, as `validate` reads it
};

/** The plan of the board, computed from the subject alone. */
export function plan(graph: Graph, start: string, subject: Subject): Draw {
  const here = subject.at || start;
  // Converted on entry: the library types labels as `PropertyKey`; the keys, ids and axes below
  // are strings.
  const rows = edges(graph).map(rowOf);
  // Asked once for the whole tool; the editor strikes the same names through from this object.
  const bad = flaws(graph, start);
  // The axis and the palette: `lanes` also orders the editor's colours.
  const all = lanes(graph, start);
  const evs = [...new Set(rows.map((r) => r.on))];
  const outs = [...new Set(rows.flatMap((r) => (r.emit ? [r.emit] : [])))];

  const cell = new Map<string, Row[]>();
  const pair = new Map<string, Row[]>();
  const shot = new Map<string, Row[]>();
  const push = (map: Map<string, Row[]>, key: string, row: Row) =>
    map.set(key, [...(map.get(key) ?? []), row]);
  for (const row of rows) {
    push(cell, `${row.from}\0${row.on}`, row);
    push(pair, `${row.from}\0${row.to}`, row);
    if (row.emit) push(shot, `${row.emit}\0${row.to}`, row);
  }

  // Reachable but not adjacent: one `analyze` per state, unioned over its successors.
  const reach = new Map(
    all.map((q) => [q, new Set<string>(analyze(graph, q).reachable)]),
  );
  const far = new Set<string>();
  for (const q of all)
    for (const row of rows)
      if (row.from === q)
        for (const t of reach.get(row.to) ?? [])
          if (!pair.has(`${q}\0${t}`)) far.add(`${q}\0${t}`);

  const lane = new Map(all.map((n, i) => [n, i]));
  const geo = geometry(all, outs, evs);

  return {
    all,
    cols: [...all].reverse(),
    evs,
    outs,
    geo,
    here,
    off: bad.off,
    rows,
    hue: (state) => hue(lane.get(state) ?? 0),
    cell,
    pair,
    shot,
    far,
    id: (r) => idOf(rows, r),
    // Asked of the subject, not the mode: a watched machine stands somewhere but cannot be moved.
    acting: !!subject.drive,
    fires: (row) => canFire(subject, idOf(rows, row)),
    dead: (row) => bad.shadowed(idOf(rows, row)),
  };
}

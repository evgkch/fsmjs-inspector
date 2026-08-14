/**
 * Everything the figure is drawn from, read off the schema once. Nothing here is a selection.
 *
 * A rule in a graph is a point (from, on, to, emit) — four discrete coordinates, and no drawing
 * has four axes. What it has instead is three blocks around two shared indices, and what this
 * works out is where each of them stands: which states are the axis, which events, which outputs,
 * and which cells hold what. Nothing here computes anything about the graph on its own —
 * `analysis` answers what reaches what, `edges` flattens the schema, `lanes` fixes the order.
 */
import { edges } from "@evgkch/fsmjs";
import type { Edge } from "@evgkch/fsmjs";
import { analyze } from "@evgkch/fsmjs/analysis";
import { flaws, hue, idOf, lanes } from "../../../entities/machine/index.js";
import type {
  Graph,
  RuleId,
  Subject,
} from "../../../entities/machine/index.js";
import { canFire } from "../../../features/take-rule/index.js";
import { CELL, EM, HEAD } from "../../../shared/lib/grid.js";

/** The band a keyword of the language stands in, beside what it is the name of. */
const CAP = 16;

/** Between the grid and the words stood on end under it. */
const GAP = 8;

/**
 * The grid the three blocks stand on: `on` gives block 1's columns, `q` the columns blocks 2 and
 * 3 share, `λ` block 3's rows, and `row` the rows blocks 1 and 2 share.
 *
 * Everything hangs *downwards* from the grid, and that is worth the paragraph.
 *
 * The grid is indexed twice over: down the middle by its rows, which are states, and across by its
 * columns, which are events on the left of that middle and states on the right. The row index is
 * written in the middle column, where it always was. The column index — every word of it, the
 * events under block 1 and the states under block 2 — is written in one band *under* the grid, and
 * block 3 comes under that.
 *
 * Which puts each index where what it indexes is. Blocks 2 and 3 share their columns, so the names
 * of those columns end up between the two blocks they name — a shared index drawn once, in the one
 * place that is not nearer to one of its blocks than to the other. And above the grid there is left
 * exactly one line, the one the four indices are named on, the same height whatever the schema is:
 * `HEAD`, which is why the run drawn on these rows no longer has to be told where they start.
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
  return {
    names: spine + wide / 2,
    spine,
    head: HEAD,
    grid,
    stem,
    foot,
    width: mid + all.length * CELL + 8,
    bottom: (outs.length ? foot + CAP + outs.length * CELL : foot) + 8,
    on: (i) => left + i * CELL + CELL / 2,
    q: (i) => mid + i * CELL + CELL / 2,
    λ: (i) => foot + CAP + i * CELL + CELL / 2,
    row: (j) => HEAD + j * CELL,
  };
}

export type Draw = {
  all: string[];
  /**
   * The same states as the columns of blocks 2 and 3, counted the other way.
   *
   * A state keeps its lane and its colour — this is the order of the columns and nothing else. The
   * rows run down from the first state, the columns run back to it, so the pair (q, q) — a rule
   * that arrives where it started — lies along the other diagonal, and the two indices meet at the
   * corner rather than running parallel.
   */
  cols: string[];
  evs: string[];
  outs: string[];
  geo: Geo;
  here: string;
  off: Set<string>; // states no run can reach from the start
  rows: Edge[];
  hue: (state: string) => string;
  cell: Map<string, Edge[]>; // from ╳ on — block 1
  pair: Map<string, Edge[]>; // from ╳ to — block 2
  shot: Map<string, Edge[]>; // emit ╳ to — block 3
  far: Set<string>; // from ╳ to — reachable, but not in one step
  id: (r: Edge) => RuleId; // which rule this is, as the guards name it
  fires: (row: Edge) => boolean; // could the machine take it from where it stands
  dead: (row: Edge) => boolean; // dead in the dump, as `validate` reads it
};

/**
 * Exploring, no state is current: the question is what the schema allows, not what this machine
 * can do next, and a marked row would answer the other question. So `here` is nowhere and nothing
 * fires — which is the whole difference between the two modes, said once.
 */
export function plan(
  graph: Graph,
  start: string,
  subject: Subject,
  exploring: boolean,
): Draw {
  const here = exploring ? "" : subject.at || start;
  const rows = edges(graph);
  // What is wrong with this schema, asked once for the whole tool: the text strikes the same
  // names through and marks the same rules dead, out of this object.
  const bad = flaws(graph, start);
  // The axis, and the palette with it: `lanes` is what the editor colours its words by too, so
  // a state is the same colour in the text as it is in the figure.
  const all = lanes(graph, start);
  const evs = [...new Set(rows.map((r) => r.on))];
  const outs = [...new Set(rows.flatMap((r) => (r.emit ? [r.emit] : [])))];

  const cell = new Map<string, Edge[]>();
  const pair = new Map<string, Edge[]>();
  const shot = new Map<string, Edge[]>();
  const push = (map: Map<string, Edge[]>, key: string, row: Edge) =>
    map.set(key, [...(map.get(key) ?? []), row]);
  for (const row of rows) {
    push(cell, `${row.from}\0${row.on}`, row);
    push(pair, `${row.from}\0${row.to}`, row);
    if (row.emit) push(shot, `${row.emit}\0${row.to}`, row);
  }

  // What is reachable but not adjacent — the part of the relation the text cannot show, since
  // reading it off a schema means following it. One `analyze` per state answers it, and the
  // union over a state's successors is what that state reaches in two steps or more.
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
    fires: (row) => !exploring && canFire(subject, idOf(rows, row)),
    dead: (row) => bad.shadowed(idOf(rows, row)),
  };
}

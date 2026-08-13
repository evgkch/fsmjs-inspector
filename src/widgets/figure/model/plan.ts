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
import { analyze, validate } from "@evgkch/fsmjs/analysis";
import { hue, idOf, lanes } from "../../../entities/machine/index.js";
import type {
  Graph,
  RuleId,
  Subject,
} from "../../../entities/machine/index.js";
import { canFire } from "../../../features/take-rule/index.js";
import { CELL, EM } from "../../../shared/lib/grid.js";

/**
 * The grid the three blocks stand on: `on` gives block 1's columns, `q` the columns blocks 2 and
 * 3 share, `λ` block 3's rows, and `row` the rows blocks 1 and 2 share.
 */
export type Geo = {
  names: number;
  spine: number;
  head: number;
  crown: number;
  width: number;
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
  const crown = outs.length ? 6 + outs.length * CELL + 10 : 0;
  const head = crown + 32 + Math.max(0, ...all.map(w), ...evs.map(w));
  return {
    names: spine + wide / 2,
    spine,
    head,
    crown,
    width: mid + all.length * CELL + 8,
    on: (i) => left + i * CELL + CELL / 2,
    q: (i) => mid + i * CELL + CELL / 2,
    λ: (i) => 6 + i * CELL + CELL / 2,
    row: (j) => head + j * CELL,
  };
}

export type Draw = {
  all: string[];
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
  const facts = analyze(graph, start);
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

  // A rule after an unguarded one in the same cell can never fire — in the dump. `validate`
  // reports that per cell, and the order inside the cell says which of its rules are the ones.
  const flagged = new Set(
    validate(graph, start)
      .filter((i) => i.kind === "dead-rule")
      .map((i) => `${i.node}\0${i.event}`),
  );

  const lane = new Map(all.map((n, i) => [n, i]));
  const geo = geometry(all, outs, evs);

  return {
    all,
    evs,
    outs,
    geo,
    here,
    off: new Set(facts.unreachable),
    rows,
    hue: (state) => hue(lane.get(state) ?? 0),
    cell,
    pair,
    shot,
    far,
    id: (r) => idOf(rows, r),
    fires: (row) => !exploring && canFire(subject, idOf(rows, row)),
    dead: (row) =>
      flagged.has(`${row.from}\0${row.on}`) &&
      cell.get(`${row.from}\0${row.on}`)?.[0] !== row,
  };
}

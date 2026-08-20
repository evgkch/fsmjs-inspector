/**
 * Layout for the classic diagram: the states in one row of cells, the transitions as rectangular
 * arcs over and under it. A leftward transition and a self-loop run over the row, a rightward one
 * under it; an arc is drawn in its target's lane colour.
 *
 * Rules that differ only in guard are one arrow: one span, one label. A rule with a different
 * `emit` is its own arrow — the labels never merge into a list.
 * Arrows are laid shortest first — self-loops, then neighbours, then further — and take the
 * lowest level free among the already placed arrows of the same side lying strictly across
 * their stretch; meeting at a shared cell alone does not push an arrow up.
 *
 * The ends stand in the halves of their cells: on top a departure in the left half, an arrival
 * in the right one; under the row mirrored. A self-loop leaves and arrives in the same halves as
 * its neighbours — so its line runs against their grain — but takes the innermost slot of each
 * half, hugs the row at the first level, and is drawn last, over everything. Within a half the shallower
 * arrow stands nearer the edge and the deeper nearer the centre, at a pitch of (half-width −
 * padding) / (ends in that half) — so a vertical never lands on another and never crosses the
 * horizontal of a shallower arrow sharing the cell. What does cross a loop is bridged by the
 * casing.
 */
import { edges } from "@evgkch/fsmjs";
import { flaws, hue, idOf, lanes } from "../../../entities/machine/index.js";
import type { Graph, RuleId } from "../../../entities/machine/index.js";
import { rowOf } from "../../../shared/lang/rules.js";
import type { Row } from "../../../shared/lang/rules.js";
import { CELL, EM } from "../../../shared/lib/grid.js";

/** Horizontal padding inside a cell and the gap between cells — the shared steps 3 and 4. */
const PAD = 12;
const GAP = 18;

/** Vertical pitch of the arc levels; each level fits its own label. */
export const STEP = 20;

/** Arrowhead height. */
export const TIP = 5;

/** Room past the outermost arc for its label, and at the two ends of the row. */
const ROOM = 14;
const SIDE = 8;

export type Chip = {
  q: string;
  /** Left edge. */
  x: number;
  w: number;
  hue: string;
  /** No run reaches it from the start. */
  off: boolean;
};

export type Arc = {
  /** The rules this arrow stands for: the same four labels, differing only in guard. */
  rows: Row[];
  /** The same rules, as the guards name them — what a click offers to take, in cell order. */
  ids: RuleId[];
  side: "top" | "bottom";
  /** Stacking level, counted from 1 at the row of cells. */
  level: number;
  /** Where the arrow leaves its source cell and enters its target cell. */
  x0: number;
  x1: number;
  hue: string;
  /** `on`, with the guard and the emit where they exist: `down · onHandle / draw`. */
  label: string;
  /** Every rule of the arrow is dead in the dump, as `validate` reads it. */
  dead: boolean;
};

export type Lay = {
  chips: Chip[];
  arcs: Arc[];
  width: number;
  height: number;
  /** Top of the row of cells. */
  base: number;
};

/** One arrow mid-layout: the span and level are fixed, the ends are not yet. */
type Laid = {
  rows: Row[];
  side: Arc["side"];
  level: number;
  self: boolean;
  c0?: Chip;
  c1?: Chip;
  cx0: number;
  cx1: number;
};

export function lay(graph: Graph, start: string): Lay {
  const all = lanes(graph, start);
  const rows = edges(graph).map(rowOf);
  const bad = flaws(graph, start);
  const lane = new Map(all.map((n, i) => [n, i]));

  let x = SIDE;
  const chips: Chip[] = all.map((q) => {
    const w = Math.max(2, q.length) * EM + PAD * 2;
    const chip = { q, x, w, hue: hue(lane.get(q) ?? 0), off: bad.off.has(q) };
    x += w + GAP;
    return chip;
  });
  const chipOf = new Map(chips.map((c) => [c.q, c]));

  /** The inset of a cell's edge slots. */
  const inset = (c?: Chip) => Math.max(0, (c?.w ?? CELL) / 2 - PAD);

  // One arrow per (from, on, to, emit), shortest first: guard variants share an arrow, a
  // different emit draws its own.
  const bunch = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.from}\0${r.on}\0${r.to}\0${r.emit ?? ""}`;
    bunch.set(k, [...(bunch.get(k) ?? []), r]);
  }
  const far = (r: Row) =>
    Math.abs((lane.get(r.to) ?? 0) - (lane.get(r.from) ?? 0));
  const order = [...bunch.values()].sort((p, q) => far(p[0]!) - far(q[0]!));

  const placed = {
    top: [] as { a: number; b: number; level: number }[],
    bottom: [] as { a: number; b: number; level: number }[],
  };
  const laid: Laid[] = order.map((group) => {
    const row = group[0]!;
    const c0 = chipOf.get(row.from);
    const c1 = chipOf.get(row.to);
    const cx0 = c0 ? c0.x + c0.w / 2 : SIDE;
    const cx1 = c1 ? c1.x + c1.w / 2 : SIDE;
    const self = row.from === row.to;
    const side: Arc["side"] = self || cx1 < cx0 ? "top" : "bottom";
    const a = self ? cx0 - inset(c0) : Math.min(cx0, cx1);
    const b = self ? cx0 + inset(c0) : Math.max(cx0, cx1);
    // The lowest level free of the already placed arrows lying across this stretch. Strictly
    // across: two arrows that merely meet at a shared cell part in its halves — a whole cell of
    // air between their ends — and may share a level.
    const used = new Set(
      placed[side].filter((s) => s.a < b && a < s.b).map((s) => s.level),
    );
    let level = 1;
    while (used.has(level)) level++;
    placed[side].push({ a, b, level });
    return { rows: group, side, level, self, c0, c1, cx0, cx1 };
  });

  // The ends, by cell, side and half — the self-loop included: its exit stands with the other
  // departures and its entry with the arrivals, so its line runs the other way.
  const halves = new Map<string, { l: Laid; end: "out" | "in" }[]>();
  const claim = (q: string, l: Laid, end: "out" | "in", right: boolean) => {
    const key = `${q}\0${l.side}\0${right ? "R" : "L"}`;
    halves.set(key, [...(halves.get(key) ?? []), { l, end }]);
  };
  for (const l of laid) {
    const row = l.rows[0]!;
    claim(row.from, l, "out", l.side !== "top");
    claim(row.to, l, "in", l.side === "top");
  }

  // Within a half: the shallower arrow nearer the edge, the deeper nearer the centre.
  const pos = new Map<Laid, { out?: number; in?: number }>();
  for (const [key, list] of halves) {
    const [q = "", , h] = key.split("\0");
    const c = chipOf.get(q);
    const cx = c ? c.x + c.w / 2 : SIDE;
    const unit = inset(c) / Math.max(1, list.length);
    [...list]
      // The self-loop last: it takes the innermost slot, nearest the cell's centre.
      .sort(
        (p, n) => Number(p.l.self) - Number(n.l.self) || p.l.level - n.l.level,
      )
      .forEach(({ l, end }, i) => {
        const at = cx + (h === "R" ? 1 : -1) * (inset(c) - i * unit);
        pos.set(l, { ...pos.get(l), [end]: at });
      });
  }

  const arcs: Arc[] = laid.map((l) => {
    const { rows: group, side, level, cx0, cx1 } = l;
    const row = group[0]!;
    // One distinct guard name rides on the label: three `down` arrows out of one state read
    // apart by their guards. Variants with several guards say only the event; the tooltip lists
    // them all.
    const whens = [
      ...new Set(group.flatMap((r) => (r.when === undefined ? [] : [r.when]))),
    ];
    const guard = whens.length === 1 ? ` · ${whens[0]}` : "";
    const label = `${row.on}${guard}${row.emit === undefined ? "" : ` / ${row.emit}`}`;
    return {
      rows: group,
      ids: group.map((r) => idOf(rows, r)),
      side,
      level,
      x0: pos.get(l)?.out ?? cx0,
      x1: pos.get(l)?.in ?? cx1,
      hue: hue(lane.get(row.to) ?? 0),
      label,
      dead: group.every((r) => bad.dead(idOf(rows, r))),
    };
  });

  // The self-loops last in the drawing order: their casing bridges whatever they cross.
  arcs.sort(
    (a, b) =>
      Number(a.rows[0]!.from === a.rows[0]!.to) -
      Number(b.rows[0]!.from === b.rows[0]!.to),
  );

  const deep = (side: Arc["side"]) =>
    Math.max(0, ...arcs.filter((r) => r.side === side).map((r) => r.level));
  const base = deep("top") * STEP + ROOM;
  return {
    chips,
    arcs,
    width: Math.max(x - GAP + SIDE, SIDE * 2),
    height: base + CELL + deep("bottom") * STEP + ROOM,
    base,
  };
}

/**
 * The three blocks, drawn and dressed in one pass.
 *
 *   ┌────────┬─────────────┐
 *   │FROM×ON │  FROM × TO  │  1 and 2 — the rows are shared across this line
 *   ├────────┼─────────────┤
 *   │  σ σ σ │   q  q  q   │  the column index, stood on end, written once
 *   └────────┼─────────────┤
 *            │  TO × EMIT  │  3 — the columns are shared down this line
 *            └─────────────┘
 *
 * Block 1 is the domain of δ: a cell is one (q, σ), the pair `dispatch` is addressed by. Block 3
 * is the codomain (r, λ); a rule that emits nothing has no cell there and is named by its column.
 * Block 2 is the same relation projected along Σ and Λ, so its cells are sets of rules.
 *
 * Blocks 1 and 3 are the two halves of a transition and behave the same way: pointing at a cell
 * runs its bands out to the names and lights the possible other halves; pressing fixes the half.
 * Block 2 is where the two bands cross — a display, never a control.
 *
 * One template over the plan and the focus: geometry from the plan, every class from `look()`,
 * so pointing and pressing cannot diverge. The differ reduces a dress to class changes.
 */
import { svg } from "lit";
import type { TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { edgeLabel } from "@evgkch/fsmjs/formatters";
import {
  CAUSE,
  CORNER,
  EFFECT,
  SOURCE,
  holds,
  keyOf,
  kindOf,
  shows,
} from "../../../entities/cell/index.js";
import type { Key } from "../../../entities/cell/index.js";
import type { Focus } from "../../../features/focus/index.js";
import { CELL } from "../../../shared/lib/grid.js";
import type { Row } from "../../../shared/lang/rules.js";
import type { Draw } from "../model/plan.js";

export type Wiring = {
  focus: Focus;
  /** Let the whole selection go — the ground under the figure does it too. */
  forget: () => void;
};

export function board(d: Draw, w: Wiring): TemplateResult {
  const { choice, pointer, look } = w.focus;
  const g = d.geo;
  const height = g.bottom;
  const width = g.width;
  const midL = g.q(0) - CELL / 2;
  const midR = g.q(d.cols.length - 1) + CELL / 2;

  const { fixed, shown, open } = look();

  // Reach is the plan's answer, not the mode's: a watched machine is running but cannot be
  // driven, and dimming its cells would misreport the run.
  const play = (r: Row) =>
    (!d.acting || d.fires(r)) && fixed.every((k) => holds(k, r));
  const lit = (r: Row) => shows(shown, r);

  // A name is one coordinate, so it lights for every lit rule that uses it.
  const coords = (r: Row) => [
    `from\0${r.from}`,
    `on\0${r.on}`,
    `to\0${r.to}`,
    `emit\0${r.emit ?? ""}`,
  ];
  const shine = new Set<string>();
  for (const r of d.rows) if (lit(r)) for (const c of coords(r)) shine.add(c);
  const here = d.here;

  /**
   * The bands of a cell: the row and column it intersects, run out to the names on both axes.
   * The band the middle block has an axis for carries on across it.
   */
  const bands = (key: Key): Record<string, number>[] => {
    const [kind, a, b] = key.split("\0");
    // A source names its state's whole row: every rule leaving it lies on it.
    if (kind === SOURCE)
      return [{ x: 0, y: g.row(d.all.indexOf(a!)), width: midR, height: CELL }];
    if (kind === CAUSE) {
      // The row is a state, indexed by block 2 too, so it goes the whole way across.
      const row = {
        x: 0,
        y: g.row(d.all.indexOf(a!)),
        width: midR,
        height: CELL,
      };
      const i = d.evs.indexOf(b!);
      if (i < 0) return [row];
      // The column is an event type with no other axis: down to its name and stop.
      return [
        row,
        { x: g.on(i) - CELL / 2, y: 0, width: CELL, height: g.foot },
      ];
    }
    if (kind === EFFECT) {
      const column = {
        x: g.q(d.cols.indexOf(b!)) - CELL / 2,
        y: 0,
        width: CELL,
        height,
      };
      // `TO r` with nothing emitted has no output row: one band.
      const i = a ? d.outs.indexOf(a) : -1;
      if (i < 0) return [column];
      // To the output's name on one side, the block's edge on the other.
      return [
        column,
        {
          x: g.spine,
          y: g.λ(i) - CELL / 2,
          width: midR - g.spine,
          height: CELL,
        },
      ];
    }
    if (kind === CORNER) {
      // A crossing names every rule out of `a` into `b`. Its bands are their coordinates, run
      // out to the names: the row, the target's column, and each way's event column and output
      // row — for one way, exactly the four bands of that rule's two halves.
      const list = d.rows.filter((r) => r.from === a && r.to === b);
      if (!list.length) return [];
      const out: Record<string, number>[] = [
        { x: 0, y: g.row(d.all.indexOf(a!)), width: midR, height: CELL },
        { x: g.q(d.cols.indexOf(b!)) - CELL / 2, y: 0, width: CELL, height },
      ];
      for (const on of new Set(list.map((r) => r.on))) {
        const i = d.evs.indexOf(on);
        if (i >= 0)
          out.push({
            x: g.on(i) - CELL / 2,
            y: 0,
            width: CELL,
            height: g.foot,
          });
      }
      for (const λ of new Set(list.flatMap((r) => (r.emit ? [r.emit] : [])))) {
        const i = d.outs.indexOf(λ);
        if (i >= 0)
          out.push({
            x: g.spine,
            y: g.λ(i) - CELL / 2,
            width: midR - g.spine,
            height: CELL,
          });
      }
      return out;
    }
    return [];
  };

  // Two keys can band the same lane — a source and the corner both band the row. Drawn once,
  // or the tint would double where they agree.
  const lanes = new Map(
    shown.flatMap(bands).map((box) => [JSON.stringify(box), box]),
  );
  const wash = [...lanes.values()].map(
    (box) =>
      svg`<rect class="lit-lane" x=${box.x} y=${box.y}
        width=${box.width} height=${box.height}></rect>`,
  );

  /**
   * What a cell answers to the state of the figure: whether anything here can still be taken,
   * whether it is what the next press asks for, and the handlers those two decide.
   */
  const spot = (key: Key, list: Row[]) => {
    const alive = list.some(play);
    const hot = fixed.includes(key) || (open.includes(kindOf(key)) && alive);
    const on = () =>
      pointer.dispatch("enter", { keys: [key], offer: true, alive });
    const off = () => pointer.dispatch("leave");
    // A press is one dispatch; the choice machine's guards decide what it meant. A crossing is
    // never held; no press is offered.
    const corner = kindOf(key) === CORNER;
    const take = corner
      ? undefined
      : () => choice.dispatch("press", { key, alive });
    const keys = corner
      ? undefined
      : (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            take!();
          }
        };
    return {
      alive,
      hot,
      lit: list.some(lit),
      on,
      off,
      take,
      keys,
      tabindex: hot ? "0" : "-1",
    };
  };

  // ── block 3: what comes out on arrival ──
  const outs = d.outs.map((λ, i) => {
    const y = g.λ(i);
    const name = svg`<text
      class=${classMap({ name: true, out: true, lit: shine.has(`emit\0${λ}`) })}
      x=${g.names} y=${y + 4} text-anchor="middle"
      style="--c: var(--emit)">${λ}</text>`;
    const cells = d.cols.flatMap((to, k) => {
      const list = d.shot.get(`${λ}\0${to}`);
      if (!list) return [];
      const s = spot(keyOf(EFFECT, λ, to), list);
      return [
        svg`<g style=${d.hue(to)}
          class=${classMap({ box: true, shot: true, dim: !s.alive, lit: s.alive && s.lit, hot: s.hot })}
          tabindex=${s.tabindex} role="button"
          @mouseenter=${s.on} @mouseleave=${s.off} @focus=${s.on} @blur=${s.off}
          @click=${s.take} @keydown=${s.keys}>
          <rect x=${g.q(k) - CELL / 2 + 3} y=${y - CELL / 2 + 3}
            width=${CELL - 6} height=${CELL - 6} rx="5"></rect>
          <title>${`TO ${to} EMIT ${λ}`}</title>
        </g>`,
      ];
    });
    return [name, ...cells];
  });

  /*
   * The four indices, named with the language's own keywords — FROM, ON, TO, EMIT — set the same
   * way the editor sets them.
   */
  const caps: TemplateResult[] = [];
  const cap = (x: number, y: number, word: string, anchor = "middle") =>
    caps.push(
      svg`<text class="cap" x=${x} y=${y} text-anchor=${anchor}>${word}</text>`,
    );
  if (d.evs.length) cap((6 + g.spine) / 2, 13, "ON");
  cap(g.names, 13, "FROM");
  if (d.cols.length) cap(g.verge, (g.stem + g.foot) / 2 + 3, "TO", "start");
  if (d.outs.length)
    cap(g.verge, (g.λ(0) + g.λ(d.outs.length - 1)) / 2 + 3, "EMIT", "start");

  /**
   * A column name stood on end under the grid. The states of TO read downward (they head the
   * column that continues into TO × EMIT) and are centred in the band; the events of ON read
   * upward and hang from the line under the grid. The baseline is shifted half a letter so the
   * word sits on its column.
   */
  const stoodAt = (x: number, turn: 90 | -90) => {
    const down = turn === 90;
    const axis = x + (down ? -4 : 4);
    const y = down ? (g.stem + g.foot) / 2 : g.stem;
    return { axis, y, anchor: down ? "middle" : "end" };
  };

  const ons = d.evs.map((σ, i) => {
    const { axis, y, anchor } = stoodAt(g.on(i), -90);
    return svg`<text
      class=${classMap({ name: true, on: true, lit: shine.has(`on\0${σ}`) })}
      x=${axis} y=${y} text-anchor=${anchor}
      transform=${`rotate(-90, ${axis}, ${y})`}>${σ}</text>`;
  });

  // `TO r` with nothing emitted has no cell in block 3; the name of the column is that
  // outcome's cell.
  const tos = d.cols.flatMap((to, i) => {
    const { axis, y, anchor } = stoodAt(g.q(i), 90);
    const ends = d.rows.filter((r) => r.emit === undefined && r.to === to);
    const s = ends.length ? spot(keyOf(EFFECT, "", to), ends) : null;
    const name = svg`<text
      class=${classMap({
        name: true,
        to: true,
        off: d.off.has(to),
        lit: shine.has(`to\0${to}`),
        here: to === here,
        hot: s?.hot ?? false,
      })}
      x=${axis} y=${y} text-anchor=${anchor} style=${d.hue(to)}
      transform=${`rotate(90, ${axis}, ${y})`}
      tabindex=${s?.tabindex ?? "-1"} role=${s ? "button" : undefined}
      @mouseenter=${s?.on} @mouseleave=${s?.off} @focus=${s?.on} @blur=${s?.off}
      @click=${s?.take} @keydown=${s?.keys}>${to}</text>`;
    if (!s) return [name];
    // A word on end is a small target; the invisible band it stands in takes the pointer.
    // The two are one control: the name is what is lit, the heading is what is hit.
    const grab = svg`<rect class="grab"
      x=${g.q(i) - CELL / 2} y=${g.stem} width=${CELL} height=${g.foot - g.stem}
      role="button"
      @mouseenter=${s.on} @mouseleave=${s.off} @click=${s.take}>
      <title>${`TO ${to}, and nothing is emitted`}</title>
    </rect>`;
    return [name, grab];
  });

  // ── the rows: blocks 1 and 2, sharing them ──

  /**
   * One cell. One square whatever it holds: the rules inside are alternatives the guards decide
   * between, not choices offered to the reader.
   */
  const square = (
    x: number,
    y: number,
    list: Row[],
    tint: string,
    key: Key,
  ) => {
    const s = spot(key, list);
    const dead = list.some(d.dead);
    const corner = kindOf(key) === CORNER;
    return svg`<g style=${tint}
      class=${classMap({ box: true, dim: !s.alive, lit: s.alive && s.lit, hot: s.hot })}
      tabindex=${s.tabindex} role=${corner ? undefined : "button"}
      @mouseenter=${s.on} @mouseleave=${s.off} @focus=${s.on} @blur=${s.off}
      @click=${s.take} @keydown=${s.keys}>
      <rect x=${x - CELL / 2 + 2.5} y=${y - CELL / 2 + 2.5}
        width=${CELL - 5} height=${CELL - 5} rx="5"></rect>
      ${
        dead
          ? svg`<path class="flag"
              d=${`M ${x + CELL / 2 - 8.5} ${y - CELL / 2 + 2.5} L ${x + CELL / 2 - 2.5} ${y - CELL / 2 + 2.5} L ${x + CELL / 2 - 2.5} ${y - CELL / 2 + 8.5} Z`}></path>`
          : ""
      }
      <title>${
        list.map(edgeLabel).join("\n") +
        (dead
          ? "\n\n`validate` calls a rule here dead: read back as a dump, an unguarded rule " +
            "ahead of it in this cell would always win. Here the guard is your second click."
          : "")
      }</title>
    </g>`;
  };

  const rows = d.all.map((from, j) => {
    const y = g.row(j);
    const name = svg`<text
      class=${classMap({
        name: true,
        side: true,
        off: d.off.has(from),
        lit: shine.has(`from\0${from}`),
        here: from === here,
      })}
      x=${g.names} y=${y + CELL / 2 + 4} text-anchor="middle"
      style=${d.hue(from)}>${from}</text>`;

    // Block 1: no lane colour — its columns are events, and where a rule leads is block 2's to
    // say.
    const causes = d.evs.flatMap((σ, i) => {
      const list = d.cell.get(`${from}\0${σ}`);
      return list
        ? [square(g.on(i), y + CELL / 2, list, "", keyOf(CAUSE, from, σ))]
        : [];
    });

    const pairs = d.cols.flatMap((to, i) => {
      const list = d.pair.get(`${from}\0${to}`);
      if (list)
        return [
          square(
            g.q(i),
            y + CELL / 2,
            list,
            d.hue(to),
            keyOf(CORNER, from, to),
          ),
        ];
      if (!d.far.has(`${from}\0${to}`)) return [];
      // Reachable, but not in one step.
      return [
        svg`<circle class="far" cx=${g.q(i)} cy=${y + CELL / 2} r="2.5">
          <title>${
            from === to
              ? `${from} lies on a cycle: a run can come back to it`
              : `${to} is reachable from ${from}, but not by one rule`
          }</title>
        </circle>`,
      ];
    });

    return svg`<g class="row">${name}${causes}${pairs}</g>`;
  });

  // The columns of blocks 2 and 3 are one line each, interrupted only by the band of names;
  // the rows of blocks 1 and 2 stop at the band of names between them.
  const rails: TemplateResult[] = [];
  d.cols.forEach((n, i) => {
    const rail = (y1: number, y2: number) =>
      rails.push(
        svg`<line class="rail" style=${d.hue(n)}
          x1=${g.q(i)} y1=${y1} x2=${g.q(i)} y2=${y2}></line>`,
      );
    rail(g.head, g.grid);
    if (d.outs.length)
      rail(g.λ(0) - CELL / 2, g.λ(d.outs.length - 1) + CELL / 2);
  });
  d.all.forEach((n, j) => {
    const y = g.row(j) + CELL / 2;
    const beam = (x1: number, x2: number) =>
      rails.push(
        svg`<line class="rail" style=${d.hue(n)}
          x1=${x1} y1=${y} x2=${x2} y2=${y}></line>`,
      );
    if (d.evs.length) beam(6, g.spine);
    if (d.all.length) beam(midL, midR);
  });

  // Where the machine stands: one dot on the index of states.
  const at = d.all.indexOf(here);
  const markDot =
    at < 0
      ? ""
      : svg`<circle class="mark" r="3.5"
          cx=${g.spine + 6} cy=${g.row(at) + CELL / 2}
          style=${d.hue(here) ?? ""}></circle>`;

  // Clicking anywhere that is not a cell lets the whole selection go. The bands are background:
  // drawn before the cells.
  return svg`<svg class="board" width=${width} height=${height}
    viewBox=${`0 0 ${width} ${height}`}>
    <rect class="floor" x="0" y="0" width=${width} height=${height}
      @click=${w.forget}></rect>
    <g class="wash">${wash}</g>
    ${rails} ${outs} ${caps} ${ons} ${tos} ${rows} ${markDot}
  </svg>`;
}

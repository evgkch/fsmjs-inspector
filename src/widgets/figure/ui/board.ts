/**
 * The three blocks, drawn and then *dressed*.
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
 * The board is built once per schema and machine position; every class it wears afterwards is
 * computed in one pass from `look()`, so pointing and pressing cannot diverge.
 */
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
import { svg } from "../../../shared/lib/dom.js";
import { CELL } from "../../../shared/lib/grid.js";
import type { Row } from "../../../shared/lang/rules.js";
import type { Draw } from "../model/plan.js";

export type Dressed = {
  node: SVGSVGElement;
  /** Put the classes on again, because something about the focus changed. */
  dress: () => void;
};

export type Wiring = {
  focus: Focus;
  /** Let the whole selection go — the ground under the figure does it too. */
  forget: () => void;
};

export function board(d: Draw, w: Wiring): Dressed {
  const { choice, pointer, look } = w.focus;
  const g = d.geo;
  const height = g.bottom;
  const width = g.width;
  const root = svg("svg", {
    class: "board",
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
  });

  /**
   * Something on the board that answers to the state of the figure. `key` is the cell it stands
   * for and `list` the rules drawn there; `base` is what it wears whatever the state is.
   */
  type Spot = {
    node: SVGElement;
    family: "box" | "name";
    key: Key;
    list: Row[];
    base: string;
    /**
     * What `dress` last computed: whether anything here can still be taken, and whether it is
     * what the next press asks for. Kept as data — the classes only draw these facts.
     */
    live: boolean;
    hot: boolean;
  };
  const spots: Spot[] = [];

  // The names along the axes. A name is one coordinate, so it is written where several cells can
  // claim it, and more than one node may say the same one.
  const tag = new Map<string, SVGElement[]>();
  const mark = <T extends SVGElement>(coord: string, node: T): T => {
    tag.set(coord, [...(tag.get(coord) ?? []), node]);
    return node;
  };
  /** The four coordinates of a rule, as the names along the axes write them. */
  const coords = (r: Row) => [
    `from\0${r.from}`,
    `on\0${r.on}`,
    `to\0${r.to}`,
    `emit\0${r.emit ?? ""}`,
  ];
  const midL = g.q(0) - CELL / 2;
  const midR = g.q(d.cols.length - 1) + CELL / 2;

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
        {
          x: g.on(i) - CELL / 2,
          y: 0,
          width: CELL,
          height: g.foot,
        },
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
        {
          x: g.q(d.cols.indexOf(b!)) - CELL / 2,
          y: 0,
          width: CELL,
          height,
        },
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

  const wash = svg("g", { class: "wash" });

  /**
   * Everything that depends on the state of the figure, in one pass. `play` says what can still
   * be taken; `shows` says what is pointed at or fixed — one predicate, shared with the editor,
   * so a cell and the line naming its rule light together.
   */
  const dress = () => {
    const { fixed, shown, open } = look();

    // Reach is the plan's answer, not the mode's: a watched machine is running but cannot be
    // driven, and dimming its cells would misreport the run.
    const play = (r: Row) =>
      (!d.acting || d.fires(r)) && fixed.every((k) => holds(k, r));
    const lit = (r: Row) => shows(shown, r);

    for (const s of spots) {
      // Three states per cell, never two at once: out of reach; lit (pointed at or held, the
      // same look); or plain.
      const alive = s.list.some(play);
      const hot =
        fixed.includes(s.key) || (open.includes(kindOf(s.key)) && alive);
      s.live = alive;
      s.hot = hot;
      const cls = [s.base];
      if (s.family === "box")
        cls.push(!alive ? "dim" : s.list.some(lit) ? "lit" : "");
      if (hot) cls.push("hot");
      s.node.setAttribute("class", cls.filter(Boolean).join(" "));
      s.node.setAttribute("tabindex", hot ? "0" : "-1");
    }

    // A name is one coordinate, so it lights for every lit rule that uses it.
    const shine = new Set<string>();
    for (const r of d.rows) if (lit(r)) for (const c of coords(r)) shine.add(c);
    for (const [coord, nodes] of tag)
      for (const node of nodes) node.classList.toggle("lit", shine.has(coord));

    // Where the machine stands — the one thing that moves on a step, so it lives in `dress`.
    const here = d.here;
    const at = d.all.indexOf(here);
    if (at < 0) markDot.setAttribute("display", "none");
    else {
      markDot.removeAttribute("display");
      markDot.setAttribute("cx", String(g.spine + 6));
      markDot.setAttribute("cy", String(g.row(at) + CELL / 2));
      markDot.setAttribute("style", d.hue(here) ?? "");
    }
    for (const q of d.all) {
      for (const node of tag.get(`from\0${q}`) ?? [])
        node.classList.toggle("here", q === here);
      for (const node of tag.get(`to\0${q}`) ?? [])
        node.classList.toggle("here", q === here);
    }

    // Two keys can band the same lane — a source and the corner both band the row. Drawn once,
    // or the tint would double where they agree.
    const lanes = new Map(
      shown.flatMap(bands).map((box) => [JSON.stringify(box), box]),
    );
    wash.replaceChildren(
      ...[...lanes.values()].map((box) =>
        svg("rect", { ...box, class: "lit-lane" }),
      ),
    );
  };

  /** A press is one dispatch; the choice machine's guards decide what it meant. */
  const choose = (key: Key, alive: boolean) =>
    choice.dispatch("press", { key, alive });

  /** Wire a cell up: pointing and pressing are each one dispatch into the focus machines. */
  const wire = (s: Spot): SVGElement => {
    spots.push(s);
    // Reach is handed over with the event; what to do about it is the machine's guard.
    const on = () =>
      pointer.dispatch("enter", { keys: [s.key], offer: true, alive: s.live });
    const off = () => pointer.dispatch("leave");
    s.node.addEventListener("mouseenter", on);
    s.node.addEventListener("mouseleave", off);
    s.node.addEventListener("focus", on);
    s.node.addEventListener("blur", off);
    // A crossing is never held; no press is offered.
    if (kindOf(s.key) === CORNER) return s.node;
    const take = () => choose(s.key, s.live);
    s.node.setAttribute("role", "button");
    s.node.addEventListener("click", take);
    s.node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        take();
      }
    });
    return s.node;
  };

  // Clicking anywhere that is not a cell lets the whole selection go.
  const floor = svg("rect", {
    x: 0,
    y: 0,
    width,
    height,
    class: "floor",
  });
  floor.addEventListener("click", w.forget);
  // The bands are background: appended before the cells.
  root.append(floor, wash);

  // The columns of blocks 2 and 3 are one line each, interrupted only by the band of names.
  d.cols.forEach((n, i) => {
    const rail = (y1: number, y2: number) =>
      root.append(
        svg("line", {
          x1: g.q(i),
          y1,
          x2: g.q(i),
          y2,
          class: "rail",
          style: d.hue(n),
        }),
      );
    rail(g.head, g.grid);
    if (d.outs.length)
      rail(g.λ(0) - CELL / 2, g.λ(d.outs.length - 1) + CELL / 2);
  });

  // The rows of blocks 1 and 2, stopping at the band of names between them.
  d.all.forEach((n, j) => {
    const y = g.row(j) + CELL / 2;
    const beam = (x1: number, x2: number) =>
      root.append(
        svg("line", { x1, y1: y, x2, y2: y, class: "rail", style: d.hue(n) }),
      );
    if (d.evs.length) beam(6, g.spine);
    if (d.all.length) beam(midL, midR);
  });

  // ── block 3: what comes out on arrival ──
  d.outs.forEach((λ, i) => {
    const y = g.λ(i);
    root.append(
      mark(
        `emit\0${λ}`,
        svg(
          "text",
          {
            x: g.names,
            y: y + 4,
            class: "name out",
            "text-anchor": "middle",
            // Λ is one axis, one colour.
            style: "--c: var(--emit)",
          },
          λ,
        ),
      ),
    );

    d.cols.forEach((to, k) => {
      const list = d.shot.get(`${λ}\0${to}`);
      if (!list) return;
      const box = svg("g", { style: d.hue(to) });
      box.append(
        svg("rect", {
          x: g.q(k) - CELL / 2 + 3,
          y: y - CELL / 2 + 3,
          width: CELL - 6,
          height: CELL - 6,
          rx: 5,
        }),
      );
      box.append(svg("title", {}, `TO ${to} EMIT ${λ}`));
      root.append(
        wire({
          node: box,
          family: "box",
          key: keyOf(EFFECT, λ, to),
          list,
          base: "box shot",
          live: false,
          hot: false,
        }),
      );
    });
  });

  /*
   * The four indices, named with the language's own keywords — FROM, ON, TO, EMIT — set the same
   * way the editor sets them.
   */
  const cap = (x: number, y: number, word: string, anchor = "middle") =>
    root.append(
      svg("text", { x, y, class: "cap", "text-anchor": anchor }, word),
    );

  // ON and FROM on the line above the grid; TO and EMIT down the right-hand edge, each against
  // the middle of the run of names it names.
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
  const stood = (
    x: number,
    name: string,
    cls: string,
    turn: 90 | -90,
    hue?: string,
  ) => {
    const down = turn === 90;
    const axis = x + (down ? -4 : 4);
    const y = down ? (g.stem + g.foot) / 2 : g.stem;
    return svg(
      "text",
      {
        x: axis,
        y,
        class: cls,
        "text-anchor": down ? "middle" : "end",
        transform: `rotate(${turn}, ${axis}, ${y})`,
        ...(hue !== undefined && { style: hue }),
      },
      name,
    );
  };

  d.evs.forEach((σ, i) => {
    root.append(mark(`on\0${σ}`, stood(g.on(i), σ, "name on", -90)));
  });

  // `TO r` with nothing emitted has no cell in block 3; the name of the column is that
  // outcome's cell.
  d.cols.forEach((to, i) => {
    const ends = d.rows.filter((r) => r.emit === undefined && r.to === to);
    const name = mark(
      `to\0${to}`,
      stood(g.q(i), to, `name to${d.off.has(to) ? " off" : ""}`, 90, d.hue(to)),
    );
    root.append(name);
    if (ends.length) {
      // A word on end is a small target; the invisible band it stands in takes the pointer.
      const grab = svg("rect", {
        x: g.q(i) - CELL / 2,
        y: g.stem,
        width: CELL,
        height: g.foot - g.stem,
        class: "grab",
      });
      grab.append(svg("title", {}, `TO ${to}, and nothing is emitted`));
      root.append(grab);
      wire({
        node: name,
        family: "name",
        key: keyOf(EFFECT, "", to),
        list: ends,
        base: name.getAttribute("class")!,
        live: false,
        hot: false,
      });
      // The two are one control: the name is what is lit, the heading is what is hit.
      grab.addEventListener("mouseenter", () =>
        name.dispatchEvent(new Event("mouseenter")),
      );
      grab.addEventListener("mouseleave", () =>
        name.dispatchEvent(new Event("mouseleave")),
      );
      grab.addEventListener("click", () =>
        name.dispatchEvent(new Event("click")),
      );
    }
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
  ): SVGGElement => {
    const box = svg("g", { style: tint });
    box.append(
      svg("rect", {
        x: x - CELL / 2 + 2.5,
        y: y - CELL / 2 + 2.5,
        width: CELL - 5,
        height: CELL - 5,
        rx: 5,
      }),
    );
    // A corner flag where `validate` calls a rule of this cell dead.
    if (list.some(d.dead))
      box.append(
        svg("path", {
          d: `M ${x + CELL / 2 - 8.5} ${y - CELL / 2 + 2.5} L ${x + CELL / 2 - 2.5} ${y - CELL / 2 + 2.5} L ${x + CELL / 2 - 2.5} ${y - CELL / 2 + 8.5} Z`,
          class: "flag",
        }),
      );
    box.append(
      svg(
        "title",
        {},
        list.map(edgeLabel).join("\n") +
          (list.some(d.dead)
            ? "\n\n`validate` calls a rule here dead: read back as a dump, an unguarded rule " +
              "ahead of it in this cell would always win. Here the guard is your second click."
            : ""),
      ),
    );
    wire({
      node: box,
      family: "box",
      key,
      list,
      base: "box",
      live: false,
      hot: false,
    });
    return box;
  };

  d.all.forEach((from, j) => {
    const y = g.row(j);
    const row = svg("g", { class: "row" });
    row.append(
      mark(
        `from\0${from}`,
        svg(
          "text",
          {
            x: g.names,
            y: y + CELL / 2 + 4,
            class: `name side${d.off.has(from) ? " off" : ""}`,
            style: d.hue(from),
            "text-anchor": "middle",
          },
          from,
        ),
      ),
    );

    // Block 1: no lane colour — its columns are events, and where a rule leads is block 2's to
    // say.
    d.evs.forEach((σ, i) => {
      const list = d.cell.get(`${from}\0${σ}`);
      if (list)
        row.append(
          square(g.on(i), y + CELL / 2, list, "", keyOf(CAUSE, from, σ)),
        );
    });

    d.cols.forEach((to, i) => {
      const list = d.pair.get(`${from}\0${to}`);
      if (list) {
        row.append(
          square(
            g.q(i),
            y + CELL / 2,
            list,
            d.hue(to),
            keyOf(CORNER, from, to),
          ),
        );
        return;
      }
      if (!d.far.has(`${from}\0${to}`)) return;
      // Reachable, but not in one step.
      const dot = svg("circle", {
        cx: g.q(i),
        cy: y + CELL / 2,
        r: 2.5,
        class: "far",
      });
      dot.append(
        svg(
          "title",
          {},
          from === to
            ? `${from} lies on a cycle: a run can come back to it`
            : `${to} is reachable from ${from}, but not by one rule`,
        ),
      );
      row.append(dot);
    });

    root.append(row);
  });

  // Where the machine stands: one dot on the index of states, moved by `dress`.
  const markDot = svg("circle", { r: 3.5, class: "mark" });
  root.append(markDot);

  dress();
  return { node: root, dress };
}

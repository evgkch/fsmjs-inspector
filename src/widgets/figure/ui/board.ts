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
 * Block 1 is the domain of δ: a row is a state, a column an event type, one cell is one (q, σ) —
 * the pair a `dispatch` is addressed by. Block 3 is the codomain, (r, λ) — and a rule that emits
 * nothing has no cell there, since there is no output to give it one, so the name of its column
 * is what names it. Block 2 is the same relation projected along Σ and Λ, so its cells are *sets*
 * of rules: several events may join one pair of states.
 *
 * 1 and 3 are the two halves of a transition, and neither is more its beginning than the other,
 * so they behave the same way. Pointing at a cell of either runs its two bands out to the names
 * on both axes — the one 2 has an axis for carrying on across it — and lights what the other half
 * could be. Pressing fixes that half: the bands stay, everything the choice rules out goes dark,
 * and what is left lit is the other half. Block 2 is where the band out of one half meets the
 * band into the other. It is a display and never a control: pointing at a corner lights the
 * causes and the outcomes that meet there, and there is nothing to press, because a crossing is
 * not something to choose.
 *
 * The board is built once for a schema and a position of the machine, and every class it wears
 * afterwards is worked out in one pass from one value — what `look` says. That is why pointing at
 * a cell and having pressed it cannot come out looking different: they arrive in the same list,
 * `shown`, and go down the same line of code.
 */
import type { Edge } from "@evgkch/fsmjs";
import { edgeLabel } from "@evgkch/fsmjs/formatters";
import {
  CAUSE,
  CORNER,
  EFFECT,
  holds,
  keyOf,
  kindOf,
  shows,
} from "../../../entities/cell/index.js";
import type { Key } from "../../../entities/cell/index.js";
import type { Focus } from "../../../features/focus/index.js";
import { svg } from "../../../shared/lib/dom.js";
import { CELL } from "../../../shared/lib/grid.js";
import type { Draw } from "../model/plan.js";

export type Dressed = {
  node: SVGSVGElement;
  /** Put the classes on again, because something about the focus changed. */
  dress: () => void;
};

export type Wiring = {
  focus: Focus;
  exploring: boolean;
  /** Let the whole selection go — the ground under the figure does it too. */
  forget: () => void;
};

export function board(d: Draw, w: Wiring): Dressed {
  const { choice, pointer, look } = w.focus;
  const g = d.geo;
  const height = g.bottom;
  const root = svg("svg", {
    class: "board",
    width: g.width,
    height,
    viewBox: `0 0 ${g.width} ${height}`,
  });

  /**
   * Something on the board that answers to the state of the figure. `key` is the cell it stands
   * for and `list` the rules drawn there; `base` is what it wears whatever the state is.
   */
  type Spot = {
    node: SVGElement;
    family: "box" | "name";
    key: Key;
    list: Edge[];
    base: string;
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
  const coords = (r: Edge) => [
    `from\0${r.from}`,
    `on\0${r.on}`,
    `to\0${r.to}`,
    `emit\0${r.emit ?? ""}`,
  ];
  const midL = g.q(0) - CELL / 2;
  const midR = g.q(d.cols.length - 1) + CELL / 2;

  /**
   * The two bands of a cell: the lines it is the intersection of, run out to the names on both
   * axes so nothing has to be counted, and the one the middle block has an axis for carried on
   * across it. That is what the middle block is — the band out of one end of a transition meets
   * the band into the other there, and where they cross is the corner the rule goes through.
   */
  const bands = (key: Key): Record<string, number>[] => {
    const [kind, a, b] = key.split("\0");
    if (kind === CAUSE) {
      // The row is a state, which block 2 indexes too, so it goes the whole way across.
      const row = {
        x: 0,
        y: g.row(d.all.indexOf(a!)),
        width: midR,
        height: CELL,
      };
      const i = d.evs.indexOf(b!);
      if (i < 0) return [row];
      // The column is an event type, and there is no axis of those anywhere else — so it runs
      // down to the name that says which event, and stops.
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
      // `TO r` with nothing emitted is named on the name of the column: one band, and no row to
      // cross it, because there is no output and so no row it could be on.
      const i = a ? d.outs.indexOf(a) : -1;
      if (i < 0) return [column];
      // Out to the name of the output on one side, and to the edge of the block on the other.
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
    // A corner of block 2 is a crossing, not a cell of either index: nothing runs out from it.
    return [];
  };

  const wash = svg("g", { class: "wash" });

  /**
   * Everything that depends on the state of the figure, in one pass over the board.
   *
   * Two predicates carry it. `play` is what is still on the table: the mode says whether the
   * machine could get there at all, and every end already fixed says whether the choice allows
   * it. `shows` is what is being pointed at or has been fixed — and it is one predicate, not
   * two, which is the whole reason a click keeps exactly the light the pointer had. It is also
   * not this file's: the editor asks the same question of its lines, which is how pointing at a
   * cell lights the rule where it is written.
   */
  const dress = () => {
    const { fixed, shown, open } = look();

    const play = (r: Edge) =>
      (w.exploring || d.fires(r)) && fixed.every((k) => holds(k, r));
    const lit = (r: Edge) => shows(shown, r);

    for (const s of spots) {
      // Three states, and the diagram is a hard enough object without a fourth. A cell is out
      // of reach; or the figure is about it — pointed at, or held, which are the same look
      // because they are the same thing seen twice; or it is neither and just there. Never two
      // at once: a cell out of reach does not answer the pointer, and a half can only be held
      // if it was in reach when it was pressed.
      const alive = s.list.some(play);
      const hot =
        fixed.includes(s.key) || (open.includes(kindOf(s.key)) && alive);
      const cls = [s.base];
      if (s.family === "box")
        cls.push(!alive ? "dim" : s.list.some(lit) ? "lit" : "");
      if (hot) cls.push("hot");
      s.node.setAttribute("class", cls.filter(Boolean).join(" "));
      s.node.setAttribute("tabindex", hot ? "0" : "-1");
    }

    // A name says one coordinate, so it says less than a cell and says it about more rules:
    // pointing at a corner of block 2 lights every ON the rules there go out on and every EMIT
    // they arrive with, and every name of one.
    const shine = new Set<string>();
    for (const r of d.rows) if (lit(r)) for (const c of coords(r)) shine.add(c);
    // A name is lit or it is not: which half was held is what the bands say, and saying it
    // twice would be a second thing to read.
    for (const [coord, nodes] of tag)
      for (const node of nodes) node.classList.toggle("lit", shine.has(coord));

    // A crossing has no bands, so aiming through one adds none: `bands` says so, and nothing
    // here has to know which kind of key it is looking at.
    wash.replaceChildren(
      ...shown
        .flatMap(bands)
        .map((box) => svg("rect", { ...box, class: "lit-lane" })),
    );
  };

  /**
   * A press, and that is the whole of it: hand the key over and let the guards say what it
   * meant. Nothing here asks which half it was, how many are named now, or what to redraw — the
   * diagram's own transition does the redrawing, and `took` is where a named transition is
   * taken. A press is not a place where any of that is decided.
   */
  const choose = (key: Key) => choice.dispatch("press", { key });

  /**
   * Wire a cell up. Pointing at it and pressing it are both one dispatch: the machine is told
   * what happened, and the board is dressed from what it says.
   */
  const wire = (s: Spot): SVGElement => {
    spots.push(s);
    // A cell that is out of reach does not answer the pointer. One rule for both modes: what is
    // out of reach differs between them — running, the machine has to be able to get there —
    // but a variant a choice has already ruled out is ruled out either way, and lighting one
    // would offer something that cannot be taken.
    const on = () => {
      if (s.node.classList.contains("dim")) return;
      pointer.dispatch("enter", { keys: [s.key], offer: true });
    };
    const off = () => pointer.dispatch("leave");
    s.node.addEventListener("mouseenter", on);
    s.node.addEventListener("mouseleave", off);
    s.node.addEventListener("focus", on);
    s.node.addEventListener("blur", off);
    // A crossing is shown and aimed through, never held — the machine's guard says so too, but
    // there is no reason to offer a press that would be refused.
    if (kindOf(s.key) === CORNER) return s.node;
    // What the figure offers is what `dress` lit; pressing anything else is nothing at all.
    const take = () => {
      if (s.node.classList.contains("hot")) choose(s.key);
    };
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
    width: g.width,
    height,
    class: "floor",
  });
  floor.addEventListener("click", w.forget);
  // The bands go in before anything else is drawn: they are the background of the rows and the
  // columns, and a background over the top of the cells is not one.
  root.append(floor, wash);

  // The lanes run through the whole figure: the columns of block 2 are the columns of block 3,
  // and drawing them as one line is what says so. They stop for the band of names between the two
  // blocks, so nothing is struck through.
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

  // Blocks 1 and 2 share their rows the way 2 and 3 share their columns, so a row is drawn as the
  // same kind of line. Both stop at the band of names — the index they are shared by, and the one
  // place a line would strike a word out.
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
            // Λ is an axis of its own and reads as one colour. Quiet until it is pointed at,
            // and then that colour — never the ink, which is the page and not a meaning.
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
        }),
      );
    });
  });

  /*
   * The four indices, named — and named in the words the language names them in.
   *
   * These are not labels for a chart. FROM, ON, TO and EMIT are four of the seven words a rule is
   * written in, and the figure's four coordinates are those four words: what a rule leaves, what
   * it leaves on, where it arrives, what comes out. So they are set as the keywords they are —
   * the same face, the same weight and the same quiet as `FROM` in the editor two panels over —
   * and not as small capitals belonging to the page.
   */
  const cap = (x: number, y: number, word: string) =>
    root.append(
      svg("text", { x, y, class: "cap", "text-anchor": "middle" }, word),
    );

  // Every one of them is centred on what it names, and there are no exceptions to look for: the
  // two column indices at the head of their runs, the two row indices over the middle column,
  // which is where the names of rows are written — FROM at its head, EMIT at the head of the
  // outputs below.
  if (d.evs.length) cap((6 + g.spine) / 2, 13, "ON");
  cap(g.names, 13, "FROM");
  if (d.cols.length) cap((g.q(0) + g.q(d.cols.length - 1)) / 2, 13, "TO");
  if (d.outs.length) cap(g.names, g.foot + 12, "EMIT");

  /**
   * A name of a column, stood on end under the grid.
   *
   * A quarter turn clockwise, so the words run *down* the page: they hang below the grid, and a
   * label that hangs downwards and reads upwards is read against the direction it points. Turned
   * this way each name starts at the column it is the name of and runs away from it, and the whole
   * band begins on one line however long the longest word is.
   */
  const stood = (x: number, name: string, cls: string, hue?: string) =>
    svg(
      "text",
      {
        x,
        y: g.stem,
        class: cls,
        "text-anchor": "start",
        transform: `rotate(90, ${x}, ${g.stem})`,
        ...(hue !== undefined && { style: hue }),
      },
      name,
    );

  d.evs.forEach((σ, i) => {
    root.append(mark(`on\0${σ}`, stood(g.on(i), σ, "name on")));
  });

  // `TO r` with nothing emitted is an outcome the grid above has no cell for — there is no output
  // to give it one, and a row for it would be a symbol the language does not have. What the
  // figure does have is the name of the column, which is where `TO r` is written and has been all
  // along. So the name is that outcome's cell, and nothing is drawn behind it.
  d.cols.forEach((to, i) => {
    const ends = d.rows.filter((r) => r.emit === undefined && r.to === to);
    const name = mark(
      `to\0${to}`,
      stood(
        g.q(i),
        to,
        `name to${to === d.here ? " here" : ""}${d.off.has(to) ? " off" : ""}`,
        d.hue(to),
      ),
    );
    root.append(name);
    if (ends.length) {
      // A word stood on end is a small thing to hit, so the band it stands in takes the pointer
      // for it — painted as nothing at all, because what a name has behind it is the page, and
      // the name lighting up is what says it can be clicked.
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
   * One cell of a lower block. It stays one square whatever it holds: the intersection the
   * controls address is (from, on), and there a cell is one `dispatch` — the rules inside it are
   * alternatives its guards decide between, not choices offered to the reader.
   */
  const square = (
    x: number,
    y: number,
    list: Edge[],
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
    // What the dump lost, flagged where it was lost: `validate`, reading the schema as text,
    // finds a rule here that an unguarded one ahead of it would always beat. Splitting the cell
    // to show which would say the cell is a choice — a corner flag says only that it is there.
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
    wire({ node: box, family: "box", key, list, base: "box" });
    return box;
  };

  d.all.forEach((from, j) => {
    const y = g.row(j);
    const row = svg("g", { class: "row" });
    // Where the machine stands, on the index of states — the one place that fact belongs, and
    // the one mark on the figure that is not a cell. Exploring there is no such state, so there
    // is no dot, which is the whole visible difference between the two.
    if (from === d.here)
      row.append(
        svg("circle", {
          cx: g.spine + 6,
          cy: y + CELL / 2,
          r: 3.5,
          style: d.hue(from),
          class: "mark",
        }),
      );
    row.append(
      mark(
        `from\0${from}`,
        svg(
          "text",
          {
            x: g.names,
            y: y + CELL / 2 + 4,
            class: `name side${from === d.here ? " here" : ""}${d.off.has(from) ? " off" : ""}`,
            style: d.hue(from),
            "text-anchor": "middle",
          },
          from,
        ),
      ),
    );

    // Block 1 is one end of a transition: a cell is one (state, event), which is what `dispatch`
    // is addressed by. No lane colour here — the columns are events, and where a rule leads is
    // what the lit column of block 2 says. One meaning per colour.
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
      // Reachable, but not in one step. The dot is the part of the relation that is not in the
      // text at any one place: it is there only as the composition of what is.
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

  dress();
  return { node: root, dress };
}

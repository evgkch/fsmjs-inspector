/**
 * What the run did, drawn on the figure's own rows.
 *
 * This is not a list of sentences. It is the third projection of the same relation: the figure
 * shows δ×λ with the states as an axis, and the history carries that axis to the right across
 * time. A row here is the row there — the same state, the same lane, the same colour — so the
 * strings run on and a step is a curve from one string to another.
 *
 * A slice is a column, and a *transition is two of them*: where it came from and where it went.
 * That is the unit the tool deals in everywhere else — a rule is a cause and an effect — so it is
 * the unit here: one step is one pair of columns, carrying one arc and one number. Between the
 * target of a step and the source of the next the machine sat still, and that is drawn as what it
 * is, a straight run along the string.
 *
 * What the history *cannot* say is which rule was taken: two rules between the same pair of
 * states are one curve here. That is why pointing at a column lights the figure and the line of
 * text — the figure narrows it to a cell and the text says the rule outright. A projection is
 * worth having as long as it does not pretend to be the whole thing.
 */
import { edges } from "@evgkch/fsmjs";
import type { Edge } from "@evgkch/fsmjs";
import { halvesOf } from "../../entities/cell/index.js";
import { hue, lanes, partsOf } from "../../entities/machine/index.js";
import type { Graph, Step, Subject } from "../../entities/machine/index.js";
import { exploring } from "../../features/explore/index.js";
import type { Mode } from "../../features/explore/index.js";
import type { Focus } from "../../features/focus/index.js";
import { between } from "../../features/take-rule/index.js";
import { make, svg } from "../../shared/lib/dom.js";
import { CELL, EM, HEAD } from "../../shared/lib/grid.js";
import "./ui/history.css";

/** The strip under the columns where the step numbers stand. */
const FOOT = 18;

/**
 * How far along a step the curve stays level before it turns.
 *
 * A cubic whose control points sit at the midpoint leaves one row and arrives at the other
 * turning the whole way, which reads as a diagonal with rounded ends. Pushed out past the middle
 * they cross, and what that draws is what a step is: a run along one string, a turn, a run along
 * the next. The horizontal is the state; the turn is the transition.
 */
const BEND = 0.82;

export type History = {
  readonly node: HTMLElement;
  /**
   * The rows this is drawn on: the same states in the same order as the figure.
   *
   * How far down they start is not asked and not passed. The figure hangs everything below its
   * grid, so its first row is `HEAD` from the top of the board whatever the schema says, and this
   * is drawn from the top of its own panel by the same number.
   */
  readonly show: (graph: Graph, start: string) => void;
  readonly draw: () => void;
  /** Draw again what the rule under the pointer would do, because the pointer moved. */
  readonly dress: () => void;
};

export type Wiring = {
  subject: Subject;
  focus: Focus;
  mode: Mode;
  /** Go to a slice. Clicking a step is the whole of undo and redo. */
  rewind: (step: number) => void;
};

export function newHistory(w: Wiring): History {
  const cols = make("div", "cols");
  const tag = make("div", "tag", "history");
  const node = make("aside", "history");
  node.append(tag, cols);
  /** Rebuilt with every draw, because the names are as wide as the names are. */
  let index: SVGSVGElement | null = null;

  let graph: Graph = {};
  let row = new Map<string, number>();
  /** Exploring there is no run: no state is current, so nothing has been taken from one. */
  const away = () => exploring(w.mode);

  const x = (col: number) => col * CELL + CELL / 2;
  const y = (state: string) => HEAD + (row.get(state) ?? 0) * CELL + CELL / 2;
  const colour = (state: string) => hue(row.get(state) ?? 0);

  /** A transition that happened, read as the rule it took. */
  const asEdge = (t: Step): Edge => ({
    from: t.source.type,
    on: t.input.type,
    to: t.target.type,
    emit: t.output?.type,
  });

  /**
   * A symmetric curve from one string to the next: the two control points are the same distance
   * in from their own ends, so a step out and a step back look alike, which they are.
   */
  const arc = (x0: number, y0: number, x1: number, y1: number) => {
    const bend = (x1 - x0) * BEND;
    return `M ${x0} ${y0} C ${x0 + bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}`;
  };

  /** The layer that changes when the pointer moves, and nothing else does. */
  let maybe: SVGGElement | null = null;

  /**
   * What would happen if the rule now under the pointer were taken: the same curve, dashed, out
   * of the slice the machine is standing in. It is drawn from the current position and not from
   * the end, because that is where a step would be taken from — with a redo future ahead of it,
   * the dashes cross it, which is exactly what taking one would do to it.
   */
  function preview(): void {
    if (!maybe) return;
    maybe.replaceChildren();
    if (away()) return;
    const { shown, offer } = w.focus.look();
    // Nothing is being pointed at, or what is under the pointer is not on offer — a step of this
    // run, recalled. `between` would answer either happily: with no cells at all every rule is
    // held by all of them, and with a past step it answers with the step. Both are a phantom.
    if (!offer || !shown.length) return;
    const rows = edges(graph);
    const id = between(w.subject, rows, shown);
    if (!id) return;
    const { from, on, at } = partsOf(id);
    const rule = rows.filter((r) => r.from === from && r.on === on)[at];
    if (!rule) return;

    const col = w.subject.step === 0 ? 0 : w.subject.step * 2 - 1;
    const x0 = x(col);
    const x1 = x(col + 1);
    maybe.append(
      svg("path", {
        d: arc(x0, y(rule.from), x1, y(rule.to)),
        class: "maybe",
        style: colour(rule.to),
      }),
      svg("circle", {
        cx: x1,
        cy: y(rule.to),
        r: 4,
        class: "maybe at",
        style: colour(rule.to),
      }),
    );
  }

  function build(): void {
    cols.replaceChildren();
    index?.remove();
    index = null;
    if (away()) return;

    const steps = w.subject.steps.map(asEdge);
    const at = w.subject.step;
    // Two columns per step, and the first of them is the slice the run started in.
    const last = steps.length ? steps.length * 2 - 1 : 0;
    const end = x(last) + CELL / 2;
    // Room past the end for what could happen next, and no more: a string running on past the
    // last thing that happened promises a run that has not been made yet.
    const width = end + CELL;
    const height = HEAD + row.size * CELL + FOOT;

    // The names, on the left of the strings and out of the scroll: this is the same index the
    // figure writes down its middle, and a row of the run means nothing without it.
    const wide = 14 + Math.max(0, ...[...row.keys()].map((n) => n.length * EM));
    index = svg("svg", {
      class: "names",
      width: wide,
      height,
      viewBox: `0 0 ${wide} ${height}`,
    });
    for (const [state] of row)
      index.append(
        svg(
          "text",
          {
            x: wide - 8,
            y: y(state) + 4,
            class: "name",
            "text-anchor": "end",
            style: colour(state),
          },
          state,
        ),
      );

    const board = svg("svg", {
      class: "run",
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
    });

    // The strings: the figure's rows, carried across. They are the same lines, the same colours
    // and the same weight — what makes this a continuation rather than a picture beside one.
    for (const [state] of row)
      board.append(
        svg("line", {
          x1: 0,
          y1: y(state),
          x2: end,
          y2: y(state),
          class: "string",
          style: colour(state),
        }),
      );

    // The run itself: an arc across each step, a straight run along the string between them.
    steps.forEach((r, i) => {
      const a = i * 2;
      board.append(
        svg("path", {
          d: arc(x(a), y(r.from), x(a + 1), y(r.to)),
          class: `trail${i + 1 > at ? " ahead" : ""}`,
          style: colour(r.to),
        }),
      );
      if (i > 0)
        board.append(
          svg("line", {
            x1: x(a - 1),
            y1: y(r.from),
            x2: x(a),
            y2: y(r.from),
            class: `trail${i + 1 > at ? " ahead" : ""}`,
            style: colour(r.from),
          }),
        );
    });

    // A slice, and the machine was in exactly one state at each of them.
    const dot = (col: number, state: string, ahead: boolean) =>
      board.append(
        svg("circle", {
          cx: x(col),
          cy: y(state),
          r: 4,
          class: `at${ahead ? " ahead" : ""}`,
          style: colour(state),
        }),
      );
    if (!steps.length) dot(0, w.subject.at, false);
    steps.forEach((r, i) => {
      dot(i * 2, r.from, i + 1 > at);
      dot(i * 2 + 1, r.to, i + 1 > at);
    });

    maybe = svg("g", { class: "ahead-of" });
    board.append(maybe);
    cols.append(board);
    node.replaceChildren(tag, index, cols);

    // One band per step, over its pair of columns: what is pointed at, what is clicked, what the
    // scroll snaps to, and what the number belongs to. A step is the unit, so a step is the
    // control — there is nothing to do with half of one.
    steps.forEach((r, i) => {
      const k = i + 1;
      const band = make(
        "div",
        `step${k === at ? " now" : ""}${k > at ? " ahead" : ""}`,
      );
      band.style.left = `${i * 2 * CELL}px`;
      band.style.width = `${CELL * 2}px`;
      band.append(make("span", "no", String(k)));
      band.title = `back to ${k}`;
      // Lit like anything else that names a rule, but not on offer: this one has been taken
      // already, and the dashes are about what could happen next.
      band.addEventListener("mouseenter", () =>
        w.focus.pointer.dispatch("enter", {
          keys: halvesOf(r),
          offer: false,
          alive: true,
        }),
      );
      band.addEventListener("mouseleave", () =>
        w.focus.pointer.dispatch("leave"),
      );
      band.addEventListener("click", () => w.rewind(k));
      cols.append(band);
    });

    preview();
    // Pinned to the newest: a run is read at its end, and what you did last is what you are
    // looking for.
    cols.scrollLeft = cols.scrollWidth;
  }

  return {
    node,

    show: (g, start) => {
      graph = g;
      row = new Map(lanes(g, start).map((n, i) => [n, i]));
    },

    draw: () => {
      node.hidden = away();
      build();
    },

    dress: () => preview(),
  };
}

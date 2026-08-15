/**
 * What the run did, drawn on the figure's own rows.
 *
 * This is not a list of sentences. It is the third projection of the same relation: the figure
 * shows δ×λ with the states as an axis, and the history carries that axis to the right across
 * time. A row here is the row there — the same state, the same lane, the same colour — so the
 * strings run on and a step is a curve from one string to another.
 *
 * A column is a slice — the machine was in exactly one state at each — and a step is the turn from
 * one to the next. So a run of n steps is n + 1 columns, and there is nothing between two of them.
 *
 * It was drawn with two columns per step and a straight run along the string between the target of
 * one and the source of the next, on the grounds that a rule is a cause and an effect. That is a
 * fact about a rule and not about a run: nothing happened in that straight stretch, and drawing
 * time passing where no time passes made every transition look as though it were taken one slice
 * late. Rewind and take a rule and you watched the machine sit through a slice it was already past
 * before it moved — which is exactly how it was read, and it was reading the picture correctly.
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

/**
 * The arrow on the end of an offer. As tall as the dot of a slice is wide and half again as long,
 * which is the smallest a head can be and still read as one at this size — and it points along
 * the curve, because the curve arrives level.
 */
const HEAD_LEN = 8;
const HEAD_HALF = 4;

/** How far out of its string a step that stays in one state goes, and comes back. */
const LOOP = 9;

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
  // The run is walked by clicking a step, and by the two keys that mean the same thing. A control
  // nobody can find is a control nobody has, and the name of the panel is where you would look.
  tag.title = "← and → walk the run";
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
  const arc = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    loop = false,
  ) => {
    const bend = (x1 - x0) * BEND;
    // A step that arrives where it left has the two ends on one string, and a curve between them
    // is a straight line — which on this board means the machine did nothing. So it is drawn as
    // the thing it is: out of the string and back into it, over the slice it took.
    if (loop)
      return `M ${x0} ${y0} C ${x0 + bend} ${y0 - LOOP}, ${x1 - bend} ${y1 - LOOP}, ${x1} ${y1}`;
    return `M ${x0} ${y0} C ${x0 + bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}`;
  };

  /** The layer that changes when the pointer moves, and nothing else does. */
  let maybe: SVGGElement | null = null;

  /**
   * What would happen if the rule now under the pointer were taken: the same curve a step is
   * drawn with, out of the slice the machine is standing in and into the one it would arrive at,
   * with an arrow on the end of it.
   *
   * One column, exactly as the step would be. It is lighter than a step that happened and it ends
   * in an arrow instead of a slice, which is the whole of what marks it as an offer — a dot is a
   * state the machine was in, and half of one at the end of a line is a state it half was in.
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

    // Out of the slice the machine is standing in and into the next, which is where the step
    // would be drawn, because a slice is a column and a step is the turn between two of them.
    const x0 = x(w.subject.step);
    const x1 = x(w.subject.step + 1);
    const y1 = y(rule.to);
    maybe.append(
      svg("path", {
        d: arc(x0, y(rule.from), x1, y1, rule.from === rule.to),
        class: "maybe",
        style: colour(rule.to),
      }),
      svg("path", {
        d: `M ${x1 - HEAD_LEN} ${y1 - HEAD_HALF} L ${x1} ${y1} L ${x1 - HEAD_LEN} ${y1 + HEAD_HALF} Z`,
        class: "maybe tip",
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
    // A column per slice: where the run started, and where each step took it.
    const end = x(steps.length) + CELL / 2;
    // Room past the end for what could happen next, and no more — one step, which is one column.
    // A string running on further than that promises a run that has not been made yet.
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

    // The run itself: one curve per step, from the slice it left to the slice it reached.
    steps.forEach((r, i) =>
      board.append(
        svg("path", {
          d: arc(x(i), y(r.from), x(i + 1), y(r.to), r.from === r.to),
          class: `trail${i + 1 > at ? " ahead" : ""}`,
          style: colour(r.to),
        }),
      ),
    );

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
    // Slice 0 is where the run began; after that there is one per step, and it is that step's
    // target — the same dot the next step leaves from, drawn once, because it is one moment.
    dot(0, steps.length ? steps[0]!.from : w.subject.at, false);
    steps.forEach((r, i) => dot(i + 1, r.to, i + 1 > at));

    maybe = svg("g", { class: "ahead-of" });
    board.append(maybe);
    cols.append(board);
    node.replaceChildren(tag, index, cols);

    // One band per step, over the slice it arrived in: what is pointed at, what is clicked, what
    // the scroll snaps to, and what the number belongs to. Going back to step k is going to the
    // slice step k reached, so the band is that slice and the number stands under it.
    steps.forEach((r, i) => {
      const k = i + 1;
      const band = make(
        "div",
        `step${k === at ? " now" : ""}${k > at ? " ahead" : ""}`,
      );
      band.style.left = `${k * CELL}px`;
      band.style.width = `${CELL}px`;
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

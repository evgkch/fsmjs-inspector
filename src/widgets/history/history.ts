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
import { foldAt, folds, hue, lanes, partsOf } from "../../entities/machine/index.js";
import type { Graph, Step, Subject } from "../../entities/machine/index.js";
import { exploring } from "../../features/explore/index.js";
import type { Mode } from "../../features/explore/index.js";
import type { Focus } from "../../features/focus/index.js";
import { between } from "../../features/take-rule/index.js";
import { make, svg } from "../../shared/lib/dom.js";
import { CELL, EM, HEAD } from "../../shared/lib/grid.js";
import "./ui/history.css";

/**
 * The strip under the columns, where a folded step says how many times it happened.
 *
 * It counted the steps once — 1, 2, 3 under the columns — and that was a ruler for a thing nobody
 * measures. Which step of a run you are looking at is not a question anyone asks; whether *this*
 * one happened once or sixty times is asked constantly, and was the one thing the picture could
 * not say. So the strip stopped being an index and became a multiplier, and it is empty under
 * everything that happened once.
 *
 * The bands over the columns are laid out in CSS and one of them has to stop where this strip
 * begins, which means the stylesheet needs this number too. It is handed over rather than written
 * down twice.
 */
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
  node.style.setProperty("--foot", `${FOOT}px`);
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
   *
   * A step that arrives where it left comes out of this as a straight segment along its own
   * string, and that is right. It was drawn as a bump out of the string and back, on the grounds
   * that a flat line reads as the machine doing nothing — true of the old board, where a step took
   * two columns and the stretch between two of them was flat. There is no such stretch now: every
   * column boundary is a step, so a flat segment between two slices *is* a step, and one that goes
   * where it was. Nothing has to be arched to be told apart from a thing that no longer exists.
   */
  const arc = (x0: number, y0: number, x1: number, y1: number) => {
    const bend = (x1 - x0) * BEND;
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
    // Out of the column the machine is standing in — which is a fold and not a step, since that is
    // what the board is drawn in. Worked out again rather than kept from the last draw: it is one
    // pass over a short list, and a copy would be a second answer to go stale.
    const on = foldAt(folds(w.subject.steps.map(asEdge)), w.subject.step);
    const x0 = x(on < 0 ? 0 : on + 1);
    const x1 = x0 + CELL;
    const y1 = y(rule.to);
    maybe.append(
      svg("path", {
        d: arc(x0, y(rule.from), x1, y1),
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
    // What the run *was*, as opposed to how many times it said so: the same transition twice in a
    // row is one turn that happened twice, and a column each is how a drag of sixty samples put
    // both ends of the picture out of reach. Everything below counts in these, and the numbers a
    // step is known by — for going back to it, for what is undone — stay the run's own.
    const list = folds(steps);
    // Where the machine stands, in columns. Inside a fold counts as being on it: a run walked back
    // into the middle of a drag is standing on that drag.
    const here = foldAt(list, at);
    // A column per slice: where the run started, and where each fold took it.
    const end = x(list.length) + CELL / 2;
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

    // The run itself: one curve per fold, from the slice it left to the slice it reached. A fold
    // of sixty is one curve — the sixty are said under it, in the strip, where a count belongs.
    list.forEach((f, i) =>
      board.append(
        svg("path", {
          d: arc(x(i), y(f.edge.from), x(i + 1), y(f.edge.to)),
          class: `trail${f.first > at ? " ahead" : ""}`,
          style: colour(f.edge.to),
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
    // Slice 0 is where the run began; after that there is one per fold, and it is where that fold
    // left the machine — the same dot the next one leaves from, drawn once, because it is one
    // moment. A fold's own repetitions arrive and leave at the same two slices, which is the whole
    // reason they can be folded at all.
    dot(0, list.length ? list[0]!.edge.from : w.subject.at, false);
    list.forEach((f, i) => dot(i + 1, f.edge.to, f.first > at));

    maybe = svg("g", { class: "ahead-of" });
    board.append(maybe);
    cols.append(board);
    node.replaceChildren(tag, index, cols);

    // One band per fold, standing on the slice it arrived in: what is pointed at, what is
    // clicked, what the scroll snaps to, and what the count belongs to. Going back to a fold is
    // going to the slice its last step reached, so the band is that slice.
    //
    // What is *drawn* is wider than what is pressed, and the stylesheet does that: a step is a turn
    // between two slices and both of them are in it, so the tint reaches back over the slice the
    // step left, and the number stands on the boundary between the two. Pressing stays one column,
    // or every column but the last would be claimed by two bands and the one underneath would be
    // unreachable.
    //
    // At the end of the run nothing is marked. The mark says the machine is standing somewhere
    // other than where the run ends — which is a thing you can only do by clicking one of these,
    // and which the run itself cannot show, since a slice you have walked back to looks exactly
    // like the slice you passed through. Sitting at the tip is the ordinary case and needs nothing
    // said about it; marking it anyway put a permanent selection on a panel nobody had touched.
    const stood = at < steps.length ? here : -1;
    list.forEach((f, i) => {
      const k = i + 1;
      const band = make(
        "div",
        `step${i === stood ? " now" : ""}${f.first > at ? " ahead" : ""}`,
      );
      band.style.left = `${k * CELL}px`;
      band.style.width = `${CELL}px`;
      // What a fold says about itself, and the only thing a column says now: how many times. Once
      // is the ordinary case and writes nothing — a strip of ×1 would be a column of ones.
      if (f.count > 1) band.append(make("span", "no", `×${f.count}`));
      band.title =
        f.count > 1
          ? `${f.count} in a row — back to the last of them`
          : "back to here";
      // Lit like anything else that names a rule, but not on offer: this one has been taken
      // already, and the dashes are about what could happen next.
      band.addEventListener("mouseenter", () =>
        w.focus.pointer.dispatch("enter", {
          keys: halvesOf(f.edge),
          offer: false,
          alive: true,
        }),
      );
      band.addEventListener("mouseleave", () =>
        w.focus.pointer.dispatch("leave"),
      );
      // Back to the last of them: a fold is one column, and the slice that column stands on is
      // where its last repetition left the machine.
      band.addEventListener("click", () => w.rewind(f.last));
      cols.append(band);
    });

    preview();
    // Where to look. At the end, when the run is at its end: a run is read at its end, and what you
    // did last is what you came for. Standing behind it — at the step you went back to. Pinning the
    // newest there scrolled the panel away from the thing that had just been clicked, in any run
    // longer than the panel is wide.
    //
    // Asked of the board rather than remembered from the loop: the mark is on it, and a second copy
    // of which band it is would be a second answer to a question with one.
    //
    // `nearest`, so a step already on screen does not move the view at all. Every redraw comes
    // through here — a step, a rewind, a word typed into the schema — and a panel that re-aims
    // itself on each of them takes the run away from whoever is reading it.
    const here = cols.querySelector<HTMLElement>(".step.now");
    if (here) here.scrollIntoView({ block: "nearest", inline: "nearest" });
    else cols.scrollLeft = cols.scrollWidth;
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

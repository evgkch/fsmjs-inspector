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
 *
 * It is a custom element — `<fsmjs-history>` — and the element *is* the `.history` panel: light
 * DOM, so a page can stand it beside a figure on its own grid, or hide it by the same rule it
 * hides anything else.
 */
import { edges } from "@evgkch/fsmjs";
import type { Edge, Off } from "@evgkch/fsmjs";
import { halvesOf } from "../../entities/cell/index.js";
import { folds, hue, lanes, partsOf } from "../../entities/machine/index.js";
import type {
  Change,
  Fold,
  Graph,
  Step,
  Subject,
} from "../../entities/machine/index.js";
import { exploring } from "../../features/explore/index.js";
import type { Mode } from "../../features/explore/index.js";
import type { Focus } from "../../features/focus/index.js";
import { between } from "../../features/take-rule/index.js";
import { make, svg } from "../../shared/lib/dom.js";
import { CELL, EM, HEAD } from "../../shared/lib/grid.js";
import "./ui/history.css";

/**
 * The strip under the columns: which step this is, and — where a fold covers several — how many.
 *
 * The numbers count the run's own steps, so a fold breaks the sequence: 1, 2, then a column that
 * arrived at step 62. The count goes in that break, on the boundary the fold's curve turns at,
 * which is where the missing numbers would have been. Both facts are in the strip and neither is
 * in the way of the other — the number says where you are, the multiplier says what is not drawn.
 *
 * The bands over the columns are laid out in CSS and one of them has to stop where this strip
 * begins, which means the stylesheet needs this number too. It is handed over rather than written
 * down twice.
 */
const FOOT = 18;

/**
 * A column of the board: one step, or the ones between the first and the last of a long run.
 *
 * Two identical steps in a row are drawn as two — there is nothing to save and nothing to hide.
 * Three or more are drawn as three: the first, a dashed one for everything in the middle, and the
 * last. The run keeps its shape — it enters, it goes on, it leaves — and what it stops doing is
 * spending a screen of columns saying the same turn sixty times.
 */
type Col = {
  edge: Edge;
  /** Which step of the run this is. Meaningless on the elided one, which is several. */
  step: number;
  first: number;
  last: number;
  /** How many there are in the run this stands for — only on the elided column. */
  count?: number;
};

const spread = (list: readonly Fold[]): Col[] =>
  list.flatMap((f) => {
    const at = (k: number): Col => ({
      edge: f.edge,
      step: k,
      first: k,
      last: k,
    });
    if (f.count <= 2)
      return Array.from({ length: f.count }, (_, i) => at(f.first + i));
    return [
      at(f.first),
      {
        edge: f.edge,
        step: -1,
        first: f.first + 1,
        last: f.last - 1,
        count: f.count,
      },
      at(f.last),
    ];
  });

/**
 * The clock on a step, to the millisecond.
 *
 * Not a date: a run is read in the sitting it happened in. The milliseconds are the point — two
 * steps in the same one are a loop, and two a second apart are somebody typing.
 */
const clock = (t: number) => {
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

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

/** A transition that happened, read as the rule it took. */
const asEdge = (t: Step): Edge => ({
  from: t.source.type,
  on: t.input.type,
  to: t.target.type,
  emit: t.output?.type,
});

/**
 * The same column twice, in every field a column has. Used to tell a step that appends — the run
 * grew, and everything already drawn still stands — from one that rewrites the tail, where a fold
 * grew a third column or a walked-back run dropped its future.
 */
const sameCol = (a: Col, b: Col): boolean =>
  a.edge.from === b.edge.from &&
  a.edge.on === b.edge.on &&
  a.edge.to === b.edge.to &&
  a.edge.emit === b.edge.emit &&
  a.count === b.count &&
  a.step === b.step &&
  a.first === b.first &&
  a.last === b.last;

export type Wiring = {
  subject: Subject;
  focus: Focus;
  mode: Mode;
  /** Go to a slice. Clicking a step is the whole of undo and redo. */
  rewind: (step: number) => void;
};

export class FsmjsHistory extends HTMLElement {
  #w?: Wiring;

  #cols: HTMLDivElement;
  #tag: HTMLDivElement;
  #ends: HTMLDivElement;

  /** Rebuilt with every draw, because the names are as wide as the names are. */
  #index: SVGSVGElement | null = null;
  /** The layer that changes when the pointer moves, and nothing else does. */
  #maybe: SVGGElement | null = null;

  #graph: Graph = {};
  #row = new Map<string, number>();

  /**
   * What a `#build` put on the board, kept so a step can be *appended* and a rewind can be
   * *re-marked* without re-laying the whole run. The columns in order, and the nodes that drew
   * them — one curve, one slice and one band per column — so the classes that say "ahead" and
   * "now" can be moved over them.
   */
  #list: Col[] = [];
  #trails: SVGPathElement[] = [];
  #slices: SVGCircleElement[] = [];
  #bands: HTMLElement[] = [];

  /** The board and its growing layers, so a new column can be dropped into the right one. */
  #board: SVGSVGElement | null = null;
  #strings: SVGGElement | null = null;
  #run: SVGGElement | null = null;
  #dotsG: SVGGElement | null = null;

  /** Stops hearing the subject while this is put down. */
  #off: Off | null = null;

  constructor() {
    super();
    this.className = "history";
    this.style.setProperty("--foot", `${FOOT}px`);

    this.#cols = make("div", "cols");
    this.#tag = make("div", "tag", "history");
    // The run is walked by clicking a step, and by the two keys that mean the same thing. A control
    // nobody can find is a control nobody has, and the name of the panel is where you would look.
    this.#tag.title = "← and → walk the run · Home and End for its ends";

    /**
     * Both ends of the run, which is the one place a fold does not save you: a session is long, and
     * "the beginning" and "where it is now" are the two slices anyone actually asks for.
     *
     * What they do is asked of the subject and not decided here. A machine that can be walked back
     * is walked back — the panel follows the mark, because the mark is what moved. One that cannot,
     * which is any machine being watched from another process, is not moved at all and the panel
     * scrolls instead: the reader wanted to see the start of the run, not to reach into somebody
     * else's application and put their machine there.
     */
    this.#ends = make("div", "ends");
    const goto = (
      name: string,
      hint: string,
      step: () => number,
      edge: number,
    ) => {
      const key = make("button", "end", name);
      key.title = hint;
      key.addEventListener("click", () => {
        if (this.#w!.subject.rewind) this.#w!.rewind(step());
        else
          this.#cols.scrollTo({ left: edge < 0 ? 0 : this.#cols.scrollWidth });
      });
      this.#ends.append(key);
      return key;
    };
    goto("start", "the slice the run began at", () => 0, -1);
    goto(
      "end",
      "where the run has got to",
      () => this.#w!.subject.steps.length,
      1,
    );

    this.#tag.append(this.#ends);
    this.append(this.#tag, this.#cols);
  }

  set wiring(w: Wiring) {
    this.#w = w;
  }

  get wiring(): Wiring {
    return this.#w!;
  }

  connectedCallback(): void {
    // Subscribed here, not in `wiring`: the element is wired before it is put in the page, and a
    // panel taken out and put back hears the subject again.
    if (this.#off || !this.#w) return;
    this.#off = this.#w.subject.watch((what) => this.#moved(what));
  }

  disconnectedCallback(): void {
    this.#off?.();
    this.#off = null;
  }

  /** Exploring there is no run: no state is current, so nothing has been taken from one. */
  #away(): boolean {
    return exploring(this.#w!.mode);
  }

  #x(col: number): number {
    return col * CELL + CELL / 2;
  }

  #y(state: string): number {
    return HEAD + (this.#row.get(state) ?? 0) * CELL + CELL / 2;
  }

  #colour(state: string): string {
    return hue(this.#row.get(state) ?? 0);
  }

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
  #arc(x0: number, y0: number, x1: number, y1: number): string {
    const bend = (x1 - x0) * BEND;
    return `M ${x0} ${y0} C ${x0 + bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}`;
  }

  /**
   * What would happen if the rule now under the pointer were taken: the same curve a step is
   * drawn with, out of the slice the machine is standing in and into the one it would arrive at,
   * with an arrow on the end of it.
   *
   * One column, exactly as the step would be. It is lighter than a step that happened and it ends
   * in an arrow instead of a slice, which is the whole of what marks it as an offer — a dot is a
   * state the machine was in, and half of one at the end of a line is a state it half was in.
   */
  #preview(): void {
    const maybe = this.#maybe;
    if (!maybe) return;
    maybe.replaceChildren();
    if (this.#away()) return;
    const w = this.#w!;
    const { shown, offer } = w.focus.look();
    // Nothing is being pointed at, or what is under the pointer is not on offer — a step of this
    // run, recalled. `between` would answer either happily: with no cells at all every rule is
    // held by all of them, and with a past step it answers with the step. Both are a phantom.
    if (!offer || !shown.length) return;
    const rows = edges(this.#graph);
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
    const sits = spread(folds(w.subject.steps.map(asEdge))).findIndex(
      (c) => w.subject.step >= c.first && w.subject.step <= c.last,
    );
    const x0 = this.#x(sits < 0 ? 0 : sits + 1);
    const x1 = x0 + CELL;
    const y1 = this.#y(rule.to);
    maybe.append(
      svg("path", {
        d: this.#arc(x0, this.#y(rule.from), x1, y1),
        class: "maybe",
        style: this.#colour(rule.to),
      }),
      svg("path", {
        d: `M ${x1 - HEAD_LEN} ${y1 - HEAD_HALF} L ${x1} ${y1} L ${x1 - HEAD_LEN} ${y1 + HEAD_HALF} Z`,
        class: "maybe tip",
        style: this.#colour(rule.to),
      }),
    );
  }

  #build(): void {
    const w = this.#w!;
    this.#cols.replaceChildren();
    this.#index?.remove();
    this.#index = null;
    this.#list = [];
    this.#trails = [];
    this.#slices = [];
    this.#bands = [];
    this.#board = null;
    this.#strings = null;
    this.#run = null;
    this.#dotsG = null;
    if (this.#away()) return;

    const steps = w.subject.steps.map(asEdge);
    const at = w.subject.step;
    // What the run *was*, as opposed to how many times it said so: the same transition twice in a
    // row is one turn that happened twice, and a column each is how a drag of sixty samples put
    // both ends of the picture out of reach. Everything below counts in these, and the numbers a
    // step is known by — for going back to it, for what is undone — stay the run's own.
    const list = spread(folds(steps));
    this.#list = list;
    // A column per slice: where the run started, and where each fold took it.
    const end = this.#x(list.length) + CELL / 2;
    // Room past the end for what could happen next, and no more — one step, which is one column.
    // A string running on further than that promises a run that has not been made yet.
    const width = end + CELL;
    const height = HEAD + this.#row.size * CELL + FOOT;

    // The names, on the left of the strings and out of the scroll: this is the same index the
    // figure writes down its middle, and a row of the run means nothing without it.
    const wide =
      14 + Math.max(0, ...[...this.#row.keys()].map((n) => n.length * EM));
    this.#index = svg("svg", {
      class: "names",
      width: wide,
      height,
      viewBox: `0 0 ${wide} ${height}`,
    });
    for (const [state] of this.#row)
      this.#index.append(
        svg(
          "text",
          {
            x: wide - 8,
            y: this.#y(state) + 4,
            class: "name",
            "text-anchor": "end",
            style: this.#colour(state),
          },
          state,
        ),
      );

    // The board, and the layers a step appends into, in draw order: the strings under the curves,
    // the curves, the slices over them, and the offer layer over all of it. Kept as groups so a
    // step taken at the end can drop one column in without re-laying the run.
    this.#board = svg("svg", {
      class: "run",
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
    });
    this.#strings = svg("g", { class: "strings" });
    this.#run = svg("g", { class: "trails" });
    this.#dotsG = svg("g", { class: "slices" });
    this.#maybe = svg("g", { class: "ahead-of" });
    this.#board.append(this.#strings, this.#run, this.#dotsG, this.#maybe);

    // The strings: the figure's rows, carried across. They are the same lines, the same colours
    // and the same weight — what makes this a continuation rather than a picture beside one.
    for (const [state] of this.#row)
      this.#strings.append(
        svg("line", {
          x1: 0,
          y1: this.#y(state),
          x2: end,
          y2: this.#y(state),
          class: "string",
          style: this.#colour(state),
        }),
      );

    // The run itself: one curve per column. A run of the same step three times or more is drawn
    // as three — the first, a dashed one standing for the ones not drawn, and the last — so the
    // shape of the run survives the shortening: you see it enter, you see it go on, you see it
    // leave.
    list.forEach((c, i) => this.#trail(c, i, at));

    // A slice, and the machine was in exactly one state at each of them.
    // Slice 0 is where the run began; after that there is one per fold, and it is where that fold
    // left the machine — the same dot the next one leaves from, drawn once, because it is one
    // moment. A fold's own repetitions arrive and leave at the same two slices, which is the whole
    // reason they can be folded at all.
    this.#slice(0, list.length ? list[0]!.edge.from : w.subject.at, false);
    list.forEach((c, i) => this.#slice(i + 1, c.edge.to, c.first > at));

    this.#cols.append(this.#board);
    this.replaceChildren(this.#tag, this.#index, this.#cols);
    // Nothing to walk and nothing to scroll: a run of no steps has one slice, and both ends of it
    // are where you already are.
    this.#ends.hidden = !list.length;

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
    const stood = this.#stood(list, at, steps.length);
    list.forEach((c, i) => this.#band(c, i, i === stood, c.first > at));

    this.#preview();
    this.#scroll();
  }

  /** How far along the run the machine stands, in columns — `-1` when it stands at its tip. */
  #stood(list: Col[], at: number, count: number): number {
    // Inside the elided middle counts as standing on it: a run walked back into a drag is
    // standing in that drag.
    const stands = list.findIndex((c) =>
      c.count === undefined ? c.step === at : at >= c.first && at <= c.last,
    );
    return at < count ? stands : -1;
  }

  /** The curve of one step, from the slice it left to the slice it arrived at. */
  #trail(c: Col, i: number, at: number): void {
    const p = svg("path", {
      d: this.#arc(
        this.#x(i),
        this.#y(c.edge.from),
        this.#x(i + 1),
        this.#y(c.edge.to),
      ),
      class: `trail${c.count === undefined ? "" : " elided"}${c.first > at ? " ahead" : ""}`,
      style: this.#colour(c.edge.to),
    });
    this.#run!.append(p);
    this.#trails.push(p);
  }

  /** A slice — the machine was in exactly one state at each of them. */
  #slice(col: number, state: string, ahead: boolean): void {
    const d = svg("circle", {
      cx: this.#x(col),
      cy: this.#y(state),
      r: 4,
      class: `at${ahead ? " ahead" : ""}`,
      style: this.#colour(state),
    });
    this.#dotsG!.append(d);
    this.#slices.push(d);
  }

  /** One band under a column: what is pressed to go back to that step. */
  #band(c: Col, i: number, now: boolean, ahead: boolean): void {
    const w = this.#w!;
    const k = i + 1;
    const band = make(
      "div",
      `step${c.count === undefined ? "" : " elided"}${now ? " now" : ""}${ahead ? " ahead" : ""}`,
    );
    band.style.left = `${k * CELL}px`;
    band.style.width = `${CELL}px`;
    // The step this column arrived at, under the column, as it always was. The dashed column is
    // not a step and has no number of its own: what stands under it is how many steps are not
    // drawn, in the break the missing numbers left. Two of them always are — the first and the
    // last, either side of it — so the count is the run's own count less those two, and the
    // smallest it can be is one.
    band.append(
      c.count === undefined
        ? make("span", "no", String(c.step))
        : make("span", "no gap", `×${c.count - 2}`),
    );
    // Everything the log widget used to be a panel for, on the thing it is about: when it
    // happened, what it was, and how many times. A title is the browser's own, costs nothing,
    // and does not need a quarter of the page to say four words.
    // Nothing is pointed at here that cannot be pressed, and the dashed column cannot: it is not
    // one step, so it is not one moment, and there is nothing to go back to. It says only how
    // many, which is written under it.
    this.#bands.push(band);
    if (c.count !== undefined) {
      this.#cols.append(band);
      return;
    }
    const when = w.subject.steps[c.step - 1]?.at;
    // The step, said the way the library says a transition and the way the figure draws one:
    // `ready × down ⇀ resizing × draw`. The two halves are the two blocks — the cause is a pair
    // (state, event) and the effect is a pair (state, letter) — and the harpoon is the partial
    // arrow out of the signature, because δ is partial: not every pair on the left has a right.
    // A step with no output is a pair on the left and a state on the right, which is what a
    // codomain with no letter in it looks like.
    band.title = [
      when === undefined ? "" : `${clock(when)}  `,
      `${c.edge.from} × ${c.edge.on} ⇀ ${c.edge.to}`,
      c.edge.emit === undefined ? "" : ` × ${c.edge.emit}`,
      w.subject.rewind ? "\nclick to go back here" : "",
    ].join("");
    // Lit like anything else that names a rule, but not on offer: this one has been taken
    // already, and the dashes are about what could happen next.
    band.addEventListener("mouseenter", () =>
      w.focus.pointer.dispatch("enter", {
        keys: halvesOf(c.edge),
        offer: false,
        alive: true,
      }),
    );
    band.addEventListener("mouseleave", () =>
      w.focus.pointer.dispatch("leave"),
    );
    // Back to the last of them: a fold is one column, and the slice that column stands on is
    // where its last repetition left the machine.
    band.addEventListener("click", () => w.rewind(c.step));
    this.#cols.append(band);
  }

  /**
   * The run grew, and nothing already drawn changed: one column appended, and the strings run on
   * to meet it. Called only when the new columns are exactly the old columns with more after them;
   * a fold that grew a third column re-lays the board instead.
   */
  #append(list: Col[], n: number, at: number, count: number): void {
    const end = this.#x(list.length) + CELL / 2;
    const width = end + CELL;
    const height = HEAD + this.#row.size * CELL + FOOT;
    this.#board!.setAttribute("width", String(width));
    this.#board!.setAttribute("viewBox", `0 0 ${width} ${height}`);
    // The strings run on to the new end.
    this.#strings!.replaceChildren(
      ...[...this.#row].map(([state]) =>
        svg("line", {
          x1: 0,
          y1: this.#y(state),
          x2: end,
          y2: this.#y(state),
          class: "string",
          style: this.#colour(state),
        }),
      ),
    );
    for (let i = n; i < list.length; i++) {
      const c = list[i]!;
      this.#trail(c, i, at);
      this.#slice(i + 1, c.edge.to, c.first > at);
      this.#band(c, i, i === this.#stood(list, at, count), c.first > at);
    }
    this.#list = list;
    this.#ends.hidden = !list.length;
    // A step taken at the end needs no mark — the tip is the ordinary case — and the redo future
    // it just dropped goes with it, so nothing keeps an `ahead` or a `now`.
    this.#remark(at, count);
    this.#scroll();
  }

  /** Put the `now` and `ahead` classes where the machine stands. Nothing else moved. */
  #remark(at: number, count: number): void {
    const list = this.#list;
    const stood = this.#stood(list, at, count);
    list.forEach((c, i) => {
      const ahead = c.first > at;
      const now = i === stood;
      this.#trails[i]?.classList.toggle("ahead", ahead);
      this.#slices[i + 1]?.classList.toggle("ahead", ahead);
      this.#bands[i]?.classList.toggle("ahead", ahead);
      this.#bands[i]?.classList.toggle("now", now);
    });
  }

  /**
   * Where to look, given where the run stands. At the end, a run is read at its end; standing
   * behind it, the mark is the thing that moved. `nearest`, so a step already on screen does not
   * move the view at all.
   */
  #scroll(): void {
    const here = this.#cols.querySelector<HTMLElement>(".step.now");
    if (here) here.scrollIntoView({ block: "nearest", inline: "nearest" });
    else this.#cols.scrollLeft = this.#cols.scrollWidth;
  }

  /** The machine moved. A step appends, a rewind re-marks, a restore re-lays the board. */
  #moved(what: Change): void {
    const w = this.#w;
    if (!w || !this.#board || this.#away()) return;
    if (what.say === "step") {
      const steps = w.subject.steps.map(asEdge);
      const at = w.subject.step;
      const list = spread(folds(steps));
      const n = this.#list.length;
      if (
        list.length >= n &&
        list.slice(0, n).every((c, i) => sameCol(c, this.#list[i]!))
      )
        this.#append(list, n, at, steps.length);
      else this.#build();
    } else if (what.say === "rewind") {
      // Nothing grew and nothing left; the mark of where the run stands is what moved.
      this.#remark(w.subject.step, w.subject.steps.length);
      this.#scroll();
    } else {
      // The whole run was restated — a reconnection, or a machine rebuilt. Nothing is safe to keep.
      this.#build();
    }
  }

  show(graph: Graph, start: string): void {
    this.#graph = graph;
    this.#row = new Map(lanes(graph, start).map((n, i) => [n, i]));
  }

  draw(): void {
    this.hidden = this.#away();
    this.#build();
  }

  dress(): void {
    this.#preview();
  }
}

if (!customElements.get("fsmjs-history"))
  customElements.define("fsmjs-history", FsmjsHistory);

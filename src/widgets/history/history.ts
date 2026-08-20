/**
 * The run, drawn on the figure's rows: the same states, lanes and colours as the figure's axis,
 * carried right across time. A column is a slice — the machine was in exactly one state at each —
 * and a step is the turn between two columns, so a run of n steps is n + 1 columns.
 *
 * The history cannot say which rule was taken: two rules between the same pair of states are one
 * curve here. Pointing at a column therefore also lights the figure and the line of text, which
 * do distinguish them.
 *
 * Custom element `<fsmjs-history>`: the element is the `.history` panel, drawn into a shadow
 * root; the palette reaches in through inherited custom properties, and the page hides the panel
 * by its light-DOM class.
 */
import { edges } from "@evgkch/fsmjs";
import type { Off } from "@evgkch/fsmjs";
import { halvesOf, holds } from "../../entities/cell/index.js";
import { folds, hue, lanes } from "../../entities/machine/index.js";
import type {
  Change,
  Fold,
  Graph,
  Step,
  Subject,
} from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { make, svg } from "../../shared/lib/dom.js";
import { CELL, EM, HEAD } from "../../shared/lib/grid.js";
import { rowOf } from "../../shared/lang/rules.js";
import type { Row } from "../../shared/lang/rules.js";
import { shadow } from "../../shared/lib/shadow.js";
import historyCss from "./ui/history.css?raw";

/**
 * Height of the strip under the columns, holding the step numbers and fold counts. The numbers
 * count the run's own steps, so a fold breaks the sequence and its count stands in the break.
 * The stylesheet needs the same height for the bands, so it is handed over as `--foot`.
 */
const FOOT = 18;

/**
 * A column of the board: one step, or the elided middle of a long repetition. Two identical
 * steps in a row are drawn as two; three or more as three — the first, a dashed column for the
 * middle, and the last.
 */
type Col = {
  edge: Row;
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

/** The time of a step, to the millisecond — enough to tell a loop from typing. Not a date. */
const clock = (t: number) => {
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

/**
 * How far along a step the curve stays level before it turns. Control points at the midpoint
 * would draw a rounded diagonal; pushed past it, the curve reads as run — turn — run.
 */
const BEND = 0.82;

/** A transition that happened, read as the rule it took. */
const asEdge = (t: Step): Row => ({
  from: t.source.type,
  on: t.input.type,
  to: t.target.type,
  emit: t.output?.type,
});

/**
 * Equality of columns, field by field. Tells an appending step (everything drawn still stands)
 * from one that rewrites the tail (a fold grew, or a walked-back run dropped its future).
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

  /** The shadow root the run is drawn into. */
  #root: ShadowRoot;

  constructor() {
    super();
    this.className = "history";
    this.#root = shadow(this, historyCss);
    this.style.setProperty("--foot", `${FOOT}px`);

    this.#cols = make("div", "cols");
    this.#tag = make("div", "tag", "history");
    // The keyboard shortcuts, named where the panel is named.
    this.#tag.title = "← and → walk the run · Home and End for its ends";

    // Shortcuts to both ends of the run. With a rewindable subject they rewind the machine;
    // a machine watched from another process is not moved, so they scroll instead.
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
    this.#root.append(this.#tag, this.#cols);
  }

  set wiring(w: Wiring) {
    // Rewired: stop hearing the old subject; already in the page, hear the new one now.
    this.#off?.();
    this.#off = null;
    this.#w = w;
    if (this.isConnected)
      this.#off = w.subject.watch((what) => this.#moved(what));
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
   * A symmetric curve from one string to the next. A step that arrives where it left comes out
   * as a straight segment along its own string — every column boundary is a step, so a flat
   * segment between two slices reads correctly as a step to the same state.
   */
  #arc(x0: number, y0: number, x1: number, y1: number): string {
    const bend = (x1 - x0) * BEND;
    return `M ${x0} ${y0} C ${x0 + bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}`;
  }

  /**
   * The step the rule under the pointer would take: the same curve as a real step, one column,
   * lighter. No arrowhead — a position in this panel is a dot, and the curve ends where the next
   * dot would stand.
   */
  #preview(): void {
    const maybe = this.#maybe;
    if (!maybe) return;
    maybe.replaceChildren();
    const w = this.#w!;
    const { shown, offer } = w.focus.look();
    // Nothing pointed at, or the pointed-at thing is a past step rather than an offer.
    if (!offer || !shown.length) return;
    // The rules the cells name, if they leave the position the machine stands in. Resolved here
    // and not by `between`: that also asks whether the machine can be driven, and a preview is
    // a drawing — a watched machine previews too. A first press names a whole cell or a whole
    // source, so there may be several candidates, one curve each.
    const here = w.subject.at;
    const rows = edges(this.#graph).map(rowOf);
    const want = rows.filter(
      (r) => r.from === here && shown.every((k) => holds(k, r)),
    );
    if (!want.length) return;

    // The column the machine stands in, in fold coordinates — recomputed each time rather than
    // cached from the last draw.
    const sits = spread(folds(w.subject.steps.map(asEdge))).findIndex(
      (c) => w.subject.step >= c.first && w.subject.step <= c.last,
    );
    const x0 = this.#x(sits < 0 ? 0 : sits + 1);
    const x1 = x0 + CELL;
    // One curve per distinct target: two rules into one state would draw the same curve twice.
    const seen = new Set<string>();
    for (const rule of want) {
      if (seen.has(rule.to)) continue;
      seen.add(rule.to);
      const y1 = this.#y(rule.to);
      maybe.append(
        svg("path", {
          d: this.#arc(x0, this.#y(rule.from), x1, y1),
          class: "maybe",
          style: this.#colour(rule.to),
        }),
        // Where the offered step would stand: the position as a ring, not yet a dot.
        svg("circle", {
          cx: x1,
          cy: y1,
          r: 4,
          class: "maybe-at",
          style: this.#colour(rule.to),
        }),
      );
    }
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

    const steps = w.subject.steps.map(asEdge);
    const at = w.subject.step;
    // Folded columns: a long repetition is drawn as first + elided middle + last. Step numbers
    // stay the run's own.
    const list = spread(folds(steps));
    this.#list = list;
    // A column per slice: where the run started, and where each fold took it.
    const end = this.#x(list.length) + CELL / 2;
    // One column of room past the end — for the preview of the next step, and no more.
    const width = end + CELL;
    const height = HEAD + this.#row.size * CELL + FOOT;

    // The names, left of the strings and out of the scroll — the same index the figure writes.
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

    // The board's layers in draw order: strings, curves, slices, preview. Kept as groups so an
    // appended step drops one column in without re-laying the run.
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

    // The strings: the figure's rows carried across — same lines, colours and weight.
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

    // One curve per column.
    list.forEach((c, i) => this.#trail(c, i, at));

    // Slices: slice 0 is where the run began, then one per fold — where that fold ended, which is
    // also where the next one starts, drawn once.
    this.#slice(0, list.length ? list[0]!.edge.from : w.subject.at, false);
    list.forEach((c, i) => this.#slice(i + 1, c.edge.to, c.first > at));

    this.#cols.append(this.#board);
    this.#root.replaceChildren(this.#tag, this.#index, this.#cols);
    // A run of no steps has one slice; there is nothing to walk or scroll.
    this.#ends.hidden = !list.length;

    // One band per fold, standing on the slice it arrived in: the click target, the snap target,
    // and the holder of the number. The tint drawn is two columns wide (both slices of the step);
    // the pressed area stays one column, or adjacent bands would overlap. At the tip of the run
    // nothing is marked — the mark means the machine stands behind the end.
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
    // The step number under the column. The dashed column is several steps, so it carries a
    // count instead — the fold's count minus the drawn first and last.
    band.append(
      c.count === undefined
        ? make("span", "no", String(c.step))
        : make("span", "no gap", `×${c.count - 2}`),
    );
    // The dashed column is several steps, not one moment: no title, no click.
    this.#bands.push(band);
    if (c.count !== undefined) {
      this.#cols.append(band);
      return;
    }
    const when = w.subject.steps[c.step - 1]?.at;
    // The step in the figure's notation: cause pair, partial arrow, effect —
    // `ready × down ⇀ resizing × draw`.
    band.title = [
      when === undefined ? "" : `${clock(when)}  `,
      `${c.edge.from} × ${c.edge.on} ⇀ ${c.edge.to}`,
      c.edge.emit === undefined ? "" : ` × ${c.edge.emit}`,
      w.subject.rewind ? "\nclick to go back here" : "",
    ].join("");
    // Lights the figure and the text, but is not an offer: this rule was already taken.
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
    // A fold rewinds to the slice its last repetition reached.
    band.addEventListener("click", () => w.rewind(c.step));
    this.#cols.append(band);
  }

  /**
   * Append columns without re-laying the board. Called only when the new columns are the old
   * ones with more after them; a fold that grew a third column rebuilds instead.
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
    if (!w || !this.#board) return;
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
    this.#build();
  }

  dress(): void {
    this.#preview();
  }
}

if (!customElements.get("fsmjs-history"))
  customElements.define("fsmjs-history", FsmjsHistory);

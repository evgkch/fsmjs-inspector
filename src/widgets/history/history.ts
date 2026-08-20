/**
 * The run, drawn on the figure's rows: the same states, lanes and colours as the figure's axis,
 * carried right across time. A column is a slice — the machine was in exactly one state at each —
 * and a step is the turn between two columns, so a run of n steps is n + 1 columns.
 *
 * The history cannot say which rule was taken: two rules between the same pair of states are one
 * curve here. Pointing at a column therefore also lights the figure and the line of text, which
 * do distinguish them.
 *
 * Custom element `<fsmjs-history>`, on Lit: the board is one template over the run and the
 * focus. A step appends a column because the differ keeps every column whose geometry did not
 * change; a rewind moves only the classes; a hover redraws only the preview layer's nodes.
 */
import { html, svg, nothing } from "lit";
import type { TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { edges } from "@evgkch/fsmjs";
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
import { CELL, EM, HEAD } from "../../shared/lib/grid.js";
import { rowOf } from "../../shared/lang/rules.js";
import type { Row } from "../../shared/lang/rules.js";
import { FsmjsElement, sheets } from "../../shared/lib/element.js";
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

export type Wiring = {
  subject: Subject;
  focus: Focus;
  /** Go to a slice. Clicking a step is the whole of undo and redo. */
  rewind: (step: number) => void;
};

export class FsmjsHistory extends FsmjsElement<Change, Wiring> {
  static override styles = sheets(historyCss);

  #graph: Graph = {};
  #row = new Map<string, number>();

  /** What the last scroll answered to, so a hover's re-render does not move the view. */
  #saw = "";

  constructor() {
    super();
    this.className = "history";
    this.style.setProperty("--foot", `${FOOT}px`);
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

  /** How far along the run the machine stands, in columns — `-1` when it stands at its tip. */
  #stood(list: Col[], at: number, count: number): number {
    // Inside the elided middle counts as standing on it: a run walked back into a drag is
    // standing in that drag.
    const stands = list.findIndex((c) =>
      c.count === undefined ? c.step === at : at >= c.first && at <= c.last,
    );
    return at < count ? stands : -1;
  }

  /**
   * The step the rule under the pointer would take: the same curve as a real step, one column,
   * lighter. No arrowhead — a position in this panel is a dot, and the curve ends where the
   * next dot would stand.
   */
  #preview(list: Col[]): TemplateResult[] {
    const w = this.w!;
    const { shown, offer } = w.focus.look();
    // Nothing pointed at, or the pointed-at thing is a past step rather than an offer.
    if (!offer || !shown.length) return [];
    // The rules the cells name, if they leave the position the machine stands in. Resolved here
    // and not by `between`: that also asks whether the machine can be driven, and a preview is
    // a drawing — a watched machine previews too. A first press names a whole cell or a whole
    // source, so there may be several candidates, one curve each.
    const here = w.subject.at;
    const want = edges(this.#graph)
      .map(rowOf)
      .filter((r) => r.from === here && shown.every((k) => holds(k, r)));
    if (!want.length) return [];

    // The column the machine stands in, in fold coordinates.
    const sits = list.findIndex(
      (c) => w.subject.step >= c.first && w.subject.step <= c.last,
    );
    const x0 = this.#x(sits < 0 ? 0 : sits + 1);
    const x1 = x0 + CELL;
    // One curve per distinct target: two rules into one state would draw the same curve twice.
    const seen = new Set<string>();
    const drawn: TemplateResult[] = [];
    for (const rule of want) {
      if (seen.has(rule.to)) continue;
      seen.add(rule.to);
      const y1 = this.#y(rule.to);
      drawn.push(
        svg`<path class="maybe" style=${this.#colour(rule.to)}
          d=${this.#arc(x0, this.#y(rule.from), x1, y1)}></path>`,
        // Where the offered step would stand: the position as a ring, not yet a dot.
        svg`<circle class="maybe-at" style=${this.#colour(rule.to)}
          cx=${x1} cy=${y1} r="4"></circle>`,
      );
    }
    return drawn;
  }

  override render(): TemplateResult | typeof nothing {
    const w = this.w;
    if (!w) return nothing;
    const steps = w.subject.steps.map(asEdge);
    const at = w.subject.step;
    // Folded columns: a long repetition is drawn as first + elided middle + last. Step numbers
    // stay the run's own.
    const list = spread(folds(steps));
    const stood = this.#stood(list, at, steps.length);
    // A column per slice: where the run started, and where each fold took it — and one column
    // of room past the end, for the preview of the next step.
    const end = this.#x(list.length) + CELL / 2;
    const width = end + CELL;
    const height = HEAD + this.#row.size * CELL + FOOT;

    // The names, left of the strings and out of the scroll — the same index the figure writes.
    const wide =
      14 + Math.max(0, ...[...this.#row.keys()].map((n) => n.length * EM));
    const names = [...this.#row.keys()].map(
      (state) =>
        svg`<text class="name" text-anchor="end" style=${this.#colour(state)}
          x=${wide - 8} y=${this.#y(state) + 4}>${state}</text>`,
    );

    // The strings: the figure's rows carried across — same lines, colours and weight.
    const strings = [...this.#row.keys()].map(
      (state) =>
        svg`<line class="string" style=${this.#colour(state)}
          x1="0" y1=${this.#y(state)} x2=${end} y2=${this.#y(state)}></line>`,
    );

    // One curve per column.
    const trails = list.map(
      (c, i) =>
        svg`<path
          class=${classMap({ trail: true, elided: c.count !== undefined, ahead: c.first > at })}
          style=${this.#colour(c.edge.to)}
          d=${this.#arc(this.#x(i), this.#y(c.edge.from), this.#x(i + 1), this.#y(c.edge.to))}></path>`,
    );

    // Slices: slice 0 is where the run began, then one per fold — where that fold ended, which
    // is also where the next one starts, drawn once.
    const slices = [
      {
        col: 0,
        state: list.length ? list[0]!.edge.from : w.subject.at,
        ahead: false,
      },
      ...list.map((c, i) => ({
        col: i + 1,
        state: c.edge.to,
        ahead: c.first > at,
      })),
    ].map(
      ({ col, state, ahead }) =>
        svg`<circle class=${classMap({ at: true, ahead })} style=${this.#colour(state)}
          cx=${this.#x(col)} cy=${this.#y(state)} r="4"></circle>`,
    );

    // One band per fold, standing on the slice it arrived in: the click target, the snap target,
    // and the holder of the number. The tint drawn is two columns wide (both slices of the
    // step); the pressed area stays one column, or adjacent bands would overlap. At the tip of
    // the run nothing is marked — the mark means the machine stands behind the end.
    const bands = list.map((c, i) => {
      const cls = classMap({
        step: true,
        elided: c.count !== undefined,
        now: i === stood,
        ahead: c.first > at,
      });
      const place = `left: ${(i + 1) * CELL}px; width: ${CELL}px`;
      // The dashed column is several steps, not one moment: no title, no click.
      if (c.count !== undefined)
        return html`<div class=${cls} style=${place}>
          <span class="no gap">×${c.count - 2}</span>
        </div>`;
      const when = w.subject.steps[c.step - 1]?.at;
      // The step in the figure's notation: cause pair, partial arrow, effect —
      // `ready × down ⇀ resizing × draw`.
      const title = [
        when === undefined ? "" : `${clock(when)}  `,
        `${c.edge.from} × ${c.edge.on} ⇀ ${c.edge.to}`,
        c.edge.emit === undefined ? "" : ` × ${c.edge.emit}`,
        w.subject.rewind ? "\nclick to go back here" : "",
      ].join("");
      // Lights the figure and the text, but is not an offer: this rule was already taken.
      return html`<div
        class=${cls}
        style=${place}
        title=${title}
        @mouseenter=${() =>
          w.focus.pointer.dispatch("enter", {
            keys: halvesOf(c.edge),
            offer: false,
            alive: true,
          })}
        @mouseleave=${() => w.focus.pointer.dispatch("leave")}
        @click=${() => w.rewind(c.step)}
      >
        <span class="no">${c.step}</span>
      </div>`;
    });

    // Shortcuts to both ends of the run. With a rewindable subject they rewind the machine;
    // a machine watched from another process is not moved, so they scroll instead.
    const goto = (step: () => number, edge: number) => () => {
      if (w.subject.rewind) w.rewind(step());
      else {
        const cols = this.renderRoot.querySelector(".cols");
        cols?.scrollTo({ left: edge < 0 ? 0 : cols.scrollWidth });
      }
    };

    return html`<div
        class="tag"
        title="← and → walk the run · Home and End for its ends"
      >
        history
        <div class="ends" ?hidden=${!list.length}>
          <button
            class="end"
            title="the slice the run began at"
            @click=${goto(() => 0, -1)}
          >
            start
          </button>
          <button
            class="end"
            title="where the run has got to"
            @click=${goto(() => w.subject.steps.length, 1)}
          >
            end
          </button>
        </div>
      </div>
      <svg
        class="names"
        width=${wide}
        height=${height}
        viewBox=${`0 0 ${wide} ${height}`}
      >
        ${names}
      </svg>
      <div class="cols">
        <svg
          class="run"
          width=${width}
          height=${height}
          viewBox=${`0 0 ${width} ${height}`}
        >
          <g class="strings">${strings}</g>
          <g class="trails">${trails}</g>
          <g class="slices">${slices}</g>
          <g class="ahead-of">${this.#preview(list)}</g>
        </svg>
        ${bands}
      </div>`;
  }

  /**
   * Where to look, given where the run stands — only when the run or the position moved, so a
   * hover's re-render does not move the view. At the end, a run is read at its end; standing
   * behind it, the mark is the thing that moved. `nearest`, so a step already on screen does
   * not move the view at all.
   */
  protected override updated(): void {
    const w = this.w;
    if (!w) return;
    const saw = `${w.subject.steps.length}\0${w.subject.step}\0${this.#row.size}`;
    if (saw === this.#saw) return;
    this.#saw = saw;
    const cols = this.renderRoot.querySelector<HTMLElement>(".cols");
    if (!cols) return;
    const here = cols.querySelector<HTMLElement>(".step.now");
    if (here) here.scrollIntoView({ block: "nearest", inline: "nearest" });
    else cols.scrollLeft = cols.scrollWidth;
  }

  show(graph: Graph, start: string): void {
    this.#graph = graph;
    this.#row = new Map(lanes(graph, start).map((n, i) => [n, i]));
    this.requestUpdate();
  }
}

if (!customElements.get("fsmjs-history"))
  customElements.define("fsmjs-history", FsmjsHistory);

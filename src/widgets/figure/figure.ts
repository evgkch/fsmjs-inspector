/**
 * The figure: a board, redrawn when the machine moves and re-dressed when the reader looks
 * somewhere else. On Lit those are one render over the plan and the focus — the differ reduces
 * a dress to class changes, and a step to moving the mark.
 *
 * It is a custom element — `<fsmjs-figure>` — so a page can put a figure down on its own, wired to
 * a subject and a focus, without lifting the whole inspector. The element *is* the `.out` box,
 * drawn on the host with a shadow root inside it: the palette reaches in through the variables,
 * and the page still hides it by the class it wears in the light DOM.
 */
import { html, nothing } from "lit";
import type { TemplateResult } from "lit";
import type { Change, Graph, Subject } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { FsmjsElement, sheets } from "../../shared/lib/element.js";
import { plan } from "./model/plan.js";
import type { Draw } from "./model/plan.js";
import { board } from "./ui/board.js";
import figureCss from "./ui/figure.css?raw";

export type Wiring = {
  subject: Subject;
  focus: Focus;
  /** Let the whole selection go. */
  forget: () => void;
};

export class FsmjsFigure extends FsmjsElement<Change, Wiring> {
  static override styles = sheets(figureCss);

  /**
   * The plan of the board, computed once per graph and start: a dress re-renders without
   * re-planning. Only `here` goes stale on a move — read live in render; reach is read off the
   * subject by the plan's own `fires`.
   */
  #planned: { graph: Graph; start: string; value: Draw } | null = null;

  constructor() {
    super();
    this.className = "out";
  }

  #plan(): Draw {
    const w = this.w!;
    const graph = w.subject.graph;
    if (
      this.#planned === null ||
      this.#planned.graph !== graph ||
      this.#planned.start !== this.start
    )
      this.#planned = {
        graph,
        start: this.start,
        value: plan(graph, this.start, w.subject),
      };
    return this.#planned.value;
  }

  override render(): TemplateResult | typeof nothing {
    const w = this.w;
    if (!w) return nothing;
    const d = this.#plan();
    d.here = w.subject.at || this.start;
    return html`<div class="tag">figure</div>
      <div class="figure">
        ${board(d, { focus: w.focus, forget: w.forget })}
      </div>`;
  }

  // What this schema would need to be shown whole: the board, and the frame around it.
  width(): number {
    const box = getComputedStyle(this);
    const frame = (
      [
        "paddingLeft",
        "paddingRight",
        "borderLeftWidth",
        "borderRightWidth",
      ] as const
    ).reduce((n, side) => n + (parseFloat(box[side]) || 0), 0);
    return (this.#planned?.value.geo.width ?? 0) + frame;
  }
}

if (!customElements.get("fsmjs-figure"))
  customElements.define("fsmjs-figure", FsmjsFigure);

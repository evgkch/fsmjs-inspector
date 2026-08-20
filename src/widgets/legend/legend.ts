/**
 * A row of names read off the subject and nothing else — the machine's alphabet, one kind per
 * element: `states` in their lane colours, `in` — the input events, `out` — the output events.
 * No frame and no control: a legend over the drawings. The kind is an attribute, because it is
 * a fact of the markup; the subject comes as `wiring`, because it is alive.
 */
import { html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import type { TemplateResult } from "lit";
import { edges } from "@evgkch/fsmjs";
import { flaws, hue, lanes } from "../../entities/machine/index.js";
import type { Change, Subject } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { rowOf } from "../../shared/lang/rules.js";
import { FsmjsElement, sheets } from "../../shared/lib/element.js";
import legendCss from "./ui/legend.css?raw";

export type Kind = "states" | "in" | "out";

export type Wiring = {
  subject: Subject;
  focus: Focus;
};

export class FsmjsLegend extends FsmjsElement<Change, Wiring> {
  static override styles = sheets(legendCss);

  constructor() {
    super();
    this.className = "legend";
  }

  #kind(): Kind {
    const k = this.getAttribute("kind");
    return k === "in" || k === "out" ? k : "states";
  }

  override render(): TemplateResult | typeof nothing {
    const w = this.w;
    if (!w) return nothing;
    const kind = this.#kind();
    if (kind === "states") {
      const here = w.subject.at || this.start;
      const bad = flaws(w.subject.graph, this.start);
      return html`<div class="line">
        <span class="tag">${kind}</span>
        ${lanes(w.subject.graph, this.start).map(
          (q, i) =>
            html`<span
              class=${classMap({
                word: true,
                off: bad.off.has(q),
                here: q === here,
              })}
              style=${hue(i)}
              >${q}</span
            >`,
        )}
      </div>`;
    }
    const seen = new Set<string>();
    for (const r of edges(w.subject.graph).map(rowOf)) {
      const name = kind === "in" ? r.on : r.emit;
      if (name !== undefined) seen.add(name);
    }
    return html`<div class="line">
      <span class="tag">${kind}</span>
      ${
        seen.size === 0
          ? html`<span class="none">—</span>`
          : [...seen].map(
              (name) =>
                html`<span class=${kind === "out" ? "word emit" : "word"}
                  >${name}</span
                >`,
            )
      }
    </div>`;
  }
}

if (!customElements.get("fsmjs-legend"))
  customElements.define("fsmjs-legend", FsmjsLegend);

/**
 * A row of names read off the subject and nothing else — the machine's alphabet, one kind per
 * element: `states` in their lane colours, `in` — the input events, `out` — the output events.
 * No frame and no control: a legend over the drawings. The kind is an attribute, because it is
 * a fact of the markup; the subject comes as `wiring`, because it is alive.
 */
import type { Off } from "@evgkch/fsmjs";
import { flaws, hue, lanes } from "../../entities/machine/index.js";
import type { Subject } from "../../entities/machine/index.js";
import { rowOf } from "../../shared/lang/rules.js";
import type { Focus } from "../../features/focus/index.js";
import { edges } from "@evgkch/fsmjs";
import { make } from "../../shared/lib/dom.js";
import { shadow } from "../../shared/lib/shadow.js";
import legendCss from "./ui/legend.css?raw";

export type Kind = "states" | "in" | "out";

export type Wiring = {
  subject: Subject;
  focus: Focus;
};

export class FsmjsLegend extends HTMLElement {
  #w?: Wiring;
  #root: ShadowRoot;
  #start = "";

  /** The words on show, to re-mark without rebuilding. */
  #words = new Map<string, HTMLElement>();

  #off: Off | null = null;

  constructor() {
    super();
    this.className = "legend";
    this.#root = shadow(this, legendCss);
  }

  connectedCallback(): void {
    if (this.#off || !this.#w) return;
    this.#off = this.#w.subject.watch(() => this.dress());
  }

  disconnectedCallback(): void {
    this.#off?.();
    this.#off = null;
  }

  set wiring(w: Wiring) {
    // Rewired: stop hearing the old subject; already in the page, hear the new one now.
    this.#off?.();
    this.#off = null;
    this.#w = w;
    if (this.isConnected) this.#off = w.subject.watch(() => this.dress());
  }

  get wiring(): Wiring {
    return this.#w!;
  }

  #kind(): Kind {
    const k = this.getAttribute("kind");
    return k === "in" || k === "out" ? k : "states";
  }

  draw(start: string): void {
    const w = this.#w;
    if (!w) return;
    this.#start = start;
    this.#words.clear();
    const kind = this.#kind();
    const rows = edges(w.subject.graph).map(rowOf);
    const line = make("div", "line");
    line.append(make("span", "tag", kind));
    if (kind === "states") {
      const bad = flaws(w.subject.graph, start);
      lanes(w.subject.graph, start).forEach((q, i) => {
        const word = make("span", "word", q);
        word.setAttribute("style", hue(i));
        if (bad.off.has(q)) word.classList.add("off");
        this.#words.set(q, word);
        line.append(word);
      });
    } else {
      const seen = new Set<string>();
      for (const r of rows) {
        const name = kind === "in" ? r.on : r.emit;
        if (name === undefined || seen.has(name)) continue;
        seen.add(name);
        line.append(make("span", kind === "out" ? "word emit" : "word", name));
      }
      if (!seen.size) line.append(make("span", "none", "—"));
    }
    this.#root.replaceChildren(line);
    this.dress();
  }

  /** Only the mark moves: the current state wears `here`. */
  dress(): void {
    const w = this.#w;
    if (!w || this.#kind() !== "states") return;
    const here = w.subject.at || this.#start;
    for (const [q, word] of this.#words)
      word.classList.toggle("here", q === here);
  }
}

if (!customElements.get("fsmjs-legend"))
  customElements.define("fsmjs-legend", FsmjsLegend);

/**
 * The figure: a board, redrawn when the machine moves and re-dressed when the reader looks
 * somewhere else. Those are two different events and cost two different amounts, which is why
 * they are two methods and not one.
 *
 * It is a custom element — `<fsmjs-figure>` — so a page can put a figure down on its own, wired to
 * a subject and a focus, without lifting the whole inspector. The element *is* the `.out` box,
 * drawn on the host with a shadow root inside it: the palette reaches in through the variables,
 * and the page still hides it by the class it wears in the light DOM.
 */
import type { Off } from "@evgkch/fsmjs";
import type { Change, Subject } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { make } from "../../shared/lib/dom.js";
import { shadow } from "../../shared/lib/shadow.js";
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

export class FsmjsFigure extends HTMLElement {
  #w?: Wiring;

  /** The shadow root the board is drawn into. */
  #root: ShadowRoot;

  /** How the board on screen puts its classes on; set by `draw`. */
  #redress: () => void = () => {};

  /**
   * The plan of the board on screen, kept so a step does not re-lay the figure. Only `here` goes
   * stale on a move: reach is read off the subject live, and the rest belongs to the graph.
   */
  #d: Draw | null = null;

  /** Where the run starts — the fallback `here` when the subject stands nowhere. */
  #start = "";

  /** Stops hearing the subject, while this is put down. */
  #off: Off | null = null;

  /** How wide the board came out; the box around it only reports the column's width. */
  #drawn = 0;

  constructor() {
    super();
    this.className = "out";
    this.#root = shadow(this, figureCss);
  }

  connectedCallback(): void {
    // Subscribe here, not in `wiring`: the element is wired before it is put in the page, and a
    // figure that has been taken out and put back hears the subject again.
    if (this.#off || !this.#w) return;
    this.#off = this.#w.subject.watch((what) => this.#moved(what));
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
    if (this.isConnected)
      this.#off = w.subject.watch((what) => this.#moved(what));
  }

  get wiring(): Wiring {
    return this.#w!;
  }

  draw(start: string): void {
    const w = this.#w;
    if (!w) return;
    this.#start = start;
    const d = plan(w.subject.graph, start, w.subject);
    this.#d = d;
    this.#drawn = d.geo.width;
    const { node: svg, dress } = board(d, {
      focus: w.focus,
      forget: w.forget,
    });
    const wrap = make("div", "figure");
    wrap.append(svg);
    this.#root.replaceChildren(make("div", "tag", "figure"), wrap);
    this.#redress = dress;
  }

  /**
   * The machine moved: only the mark moves with it, so re-dressing is enough. A step, a rewind
   * and a restore all land here the same way.
   */
  #moved(_what: Change): void {
    const w = this.#w;
    const d = this.#d;
    if (!w || !d) return;
    d.here = w.subject.at || this.#start;
    this.#redress();
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
    return this.#drawn + frame;
  }

  dress(): void {
    this.#redress();
  }
}

if (!customElements.get("fsmjs-figure"))
  customElements.define("fsmjs-figure", FsmjsFigure);

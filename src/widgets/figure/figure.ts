/**
 * The figure: a board, redrawn when the machine moves and re-dressed when the reader looks
 * somewhere else. Those are two different events and cost two different amounts, which is why
 * they are two methods and not one.
 *
 * It is a custom element — `<fsmjs-figure>` — so a page can put a figure down on its own, wired to
 * a subject and a focus, without lifting the whole inspector. The element *is* the `.out` box:
 * light DOM, so the shared tokens and the page's own grid both reach it unchanged.
 */
import type { Off } from "@evgkch/fsmjs";
import type { Change, Subject } from "../../entities/machine/index.js";
import { exploring } from "../../features/explore/index.js";
import type { Mode } from "../../features/explore/index.js";
import type { Focus } from "../../features/focus/index.js";
import { make } from "../../shared/lib/dom.js";
import { plan } from "./model/plan.js";
import type { Draw } from "./model/plan.js";
import { board } from "./ui/board.js";
import "./ui/figure.css";

export type Wiring = {
  subject: Subject;
  focus: Focus;
  mode: Mode;
  /** Let the whole selection go. */
  forget: () => void;
};

export class FsmjsFigure extends HTMLElement {
  #w?: Wiring;

  /**
   * How the board now on screen puts its classes on, set by `draw`. Nothing before the first draw
   * has anything to dress — which is not said here with a `?.` but by the page's own machine,
   * where `blank` has no rule for looking.
   */
  #redress: () => void = () => {};

  /**
   * The plan of the board now on screen, kept so a step does not have to re-lay the whole figure
   * out. Only `here` in it goes stale when the machine moves: reach (`fires`) is read off the
   * subject live, and the axes, lanes and geometry belong to the graph, which a step does not
   * touch. `restore` restates the same graph on the same subject, so it leaves this alone too.
   */
  #d: Draw | null = null;

  /** Where the run starts — the fallback `here` when the subject stands nowhere. */
  #start = "";

  /** Stops hearing the subject, while this is put down. */
  #off: Off | null = null;

  /**
   * How wide the board came out. The box around it says nothing about that: it is a scroll
   * container stretched to its column, so what it reports is the column's width, never the
   * board's.
   */
  #drawn = 0;

  constructor() {
    super();
    this.className = "out";
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
    this.#w = w;
  }

  get wiring(): Wiring {
    return this.#w!;
  }

  draw(start: string): void {
    const w = this.#w;
    if (!w) return;
    this.#start = start;
    const d = plan(w.subject.graph, start, w.subject, exploring(w.mode));
    this.#d = d;
    this.#drawn = d.geo.width;
    const { node: svg, dress } = board(d, {
      focus: w.focus,
      forget: w.forget,
    });
    const wrap = make("div", "figure");
    wrap.append(svg);
    this.replaceChildren(make("div", "tag", "figure"), wrap);
    this.#redress = dress;
  }

  /**
   * The machine moved, and the one thing that moves with it is the mark of where it stands — reach
   * is answered from the subject fresh each pass, so re-dressing re-marks and re-dims without a
   * layout. `what` is read for nothing beyond that: a step, a rewind and a restore all land here
   * the same way, because the figure has no memory of *how* it was reached, only of where it is.
   */
  #moved(_what: Change): void {
    const w = this.#w;
    const d = this.#d;
    if (!w || !d) return;
    d.here = exploring(w.mode) ? "" : w.subject.at || this.#start;
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

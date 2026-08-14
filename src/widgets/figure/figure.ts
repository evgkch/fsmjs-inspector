/**
 * The figure: a board, redrawn when the machine moves and re-dressed when the reader looks
 * somewhere else. Those are two different events and cost two different amounts, which is why
 * they are two functions and not one.
 */
import type { Subject } from "../../entities/machine/index.js";
import { exploring } from "../../features/explore/index.js";
import type { Mode } from "../../features/explore/index.js";
import type { Focus } from "../../features/focus/index.js";
import { make } from "../../shared/lib/dom.js";
import { plan } from "./model/plan.js";
import { board } from "./ui/board.js";
import "./ui/figure.css";

export type Figure = {
  readonly node: HTMLElement;
  /** Draw it again, because the machine moved or the schema changed. */
  readonly draw: (start: string) => void;
  /** How wide the board it drew is, whole — what it would take not to scroll. */
  readonly width: () => number;
  /** Put the classes on again, because the reader is looking somewhere else. */
  readonly dress: () => void;
};

export type Wiring = {
  subject: Subject;
  focus: Focus;
  mode: Mode;
  /** Let the whole selection go. */
  forget: () => void;
};

export function newFigure(w: Wiring): Figure {
  const node = make("div", "out");

  /**
   * How the board now on screen puts its classes on, set by `draw`. Nothing before the first draw
   * has anything to dress — which is not said here with a `?.` but by the page's own machine,
   * where `blank` has no rule for looking.
   */
  let redress: () => void = () => {};

  /**
   * How wide the board came out. The box around it says nothing about that: it is a scroll
   * container stretched to its column, so what it reports is the column's width, never the
   * board's.
   */
  let drawn = 0;

  return {
    node,
    draw: (start) => {
      const d = plan(w.subject.graph, start, w.subject, exploring(w.mode));
      drawn = d.geo.width;
      const { node: svg, dress } = board(d, {
        focus: w.focus,
        exploring: exploring(w.mode),
        forget: w.forget,
      });
      const wrap = make("div", "figure");
      wrap.append(svg);
      node.replaceChildren(make("div", "tag", "figure"), wrap);
      redress = dress;
    },
    // What this schema would need to be shown whole: the board, and the frame around it.
    width: () => {
      const box = getComputedStyle(node);
      const frame = (
        [
          "paddingLeft",
          "paddingRight",
          "borderLeftWidth",
          "borderRightWidth",
        ] as const
      ).reduce((n, side) => n + (parseFloat(box[side]) || 0), 0);
      return drawn + frame;
    },

    dress: () => redress(),
  };
}

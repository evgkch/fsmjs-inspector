/**
 * The inspector: a figure, and what the run did to it.
 *
 * What is being inspected is a `Subject` — a dump, or a machine that is running — and neither the
 * figure nor the history ever learns which. What is being *looked at* is a `Focus`, and that one is
 * handed in from outside when there is a second surface showing the same machine: the standalone
 * page gives its editor and its figure the same focus, which is why pointing at a cell lights the
 * line the rule is written on.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { RuleId, Subject } from "../../entities/machine/index.js";
import { newFocus } from "../../features/focus/index.js";
import { newSight } from "./model/showing.js";
import type { Focus } from "../../features/focus/index.js";
import { make } from "../../shared/lib/dom.js";
import { ensemble } from "./ensemble.js";
import type { Member } from "./ensemble.js";
import { FsmjsFigure } from "../../widgets/figure/figure.js";
import { FsmjsHistory } from "../../widgets/history/history.js";
import "./ui/inspector.css";

/** How a figure is being looked at, as opposed to what it is looking at. */
export type Options = {
  /** Share the looking with something else on the page — an editor, another figure. */
  focus?: Focus;
};

export type { Member, Surface } from "./ensemble.js";

export type Handle = {
  /** Draw again, because something about the subject changed. */
  readonly update: () => void;
  /** Enrol another widget on the same subject and focus — a diagram, a second figure. */
  readonly enroll: (s: Member) => void;
  /** Take a rule by its id, if the machine can — for an editor's fire, or any other surface. */
  readonly fire: (id: RuleId) => void;
  /** Let go: listeners, and the DOM this put in the host. */
  readonly destroy: () => void;
};

export function mount(
  host: HTMLElement,
  subject: Subject,
  options: Options = {},
): Handle {
  const focus = options.focus ?? newFocus();

  // The binder wires the cast and maps manual actions between the members; the mount adds the
  // layout, the measuring and the keyboard.
  const figure = new FsmjsFigure();
  const history = new FsmjsHistory();
  const band = ensemble(subject, { figure, history }, { focus });
  const forget = band.forget;

  /** What is on screen and how it is arranged — the one piece of remembered state here. */
  const sight = newSight();

  // The room changes with the window, and what fits in it changes with the room.
  const watching = new ResizeObserver(() => sight.dispatch("measured", room()));

  // The figure, and what happened on it — beside it or under it, which `fit` decides.
  const work = make("div", "work");
  work.append(figure, history);
  const root = make("div", "fsmjs-inspector");
  root.append(work);
  host.append(root);
  watching.observe(work);

  /** The space there is, measured; the sight machine decides what fits. */
  function room() {
    const style = getComputedStyle(work);
    return {
      board: figure.width(),
      room: work.clientWidth,
      gap: parseFloat(style.columnGap) || 0,
      min: parseFloat(style.getPropertyValue("--history-min")) || 0,
    };
  }

  /** Something the figure is about has changed. What follows from that is the machine's. */
  const show = () => sight.dispatch("moved");

  const off: (() => void)[] = [
    sight.rx.on("redraw", () => {
      band.draw();
      // Measured after layout — and after this dispatch, which cannot nest another.
      queueMicrotask(() => sight.dispatch("measured", room()));
    }),
    sight.rx.on("redress", () => band.dress()),
    // The column is the board's own width, so the figure shows whole or not at all.
    sight.rx.on("aside", ({ board }) => {
      work.style.setProperty("--board", `${board}px`);
      work.classList.add("beside");
    }),
    sight.rx.on("below", ({ board }) => {
      work.style.setProperty("--board", `${board}px`);
      work.classList.remove("beside");
    }),
    focus.choice.rx.on(TRANSITION, () => sight.dispatch("looked")),
    focus.pointer.rx.on(TRANSITION, () => sight.dispatch("looked")),
    () => watching.disconnect(),
  ];

  /**
   * Keyboard walk of the run — skipped while typing. The check uses `composedPath()[0]`, not
   * `target`: an event leaving a shadow tree is retargeted to the host, so `target` for a
   * keystroke in the source is `<fsmjs-editor>`, not the textarea.
   */
  const onKey = (e: KeyboardEvent) => {
    // Esc drops the whole selection.
    if (e.key === "Escape") return void forget();
    const into = (e.composedPath()[0] as HTMLElement | null)?.tagName ?? "";
    if (into === "TEXTAREA" || into === "INPUT" || into === "SELECT") return;
    if (!subject.rewind) return;
    const to =
      e.key === "ArrowLeft"
        ? subject.step - 1
        : e.key === "ArrowRight"
          ? subject.step + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? subject.steps.length
              : null;
    if (to === null || to < 0 || to > subject.steps.length) return;
    e.preventDefault();
    band.rewind(to);
  };
  document.addEventListener("keydown", onKey);

  show();

  return {
    update: show,
    enroll: band.enroll,
    fire: band.fire,
    destroy: () => {
      for (const it of off) it();
      band.destroy();
      document.removeEventListener("keydown", onKey);
      root.remove();
    },
  };
}

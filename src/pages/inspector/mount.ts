/**
 * The inspector: a figure, and what the run did to it.
 *
 * What is being inspected is a `Subject` — a dump, or a machine that is running — and neither the
 * figure nor the history ever learns which. What is being *looked at* is a `Focus`, and that one is
 * handed in from outside when there is a second surface showing the same machine: the standalone
 * page gives its editor and its figure the same focus, which is why pointing at a cell lights the
 * line the rule is written on.
 */
import { TRANSITION, edges } from "@evgkch/fsmjs";
import type { Graph, Subject } from "../../entities/machine/index.js";
import { newMode } from "../../features/explore/index.js";
import type { Mode } from "../../features/explore/index.js";
import { newFocus } from "../../features/focus/index.js";
import type { Focus } from "../../features/focus/index.js";
import { between, take } from "../../features/take-rule/index.js";
import { make } from "../../shared/lib/dom.js";
import { newFigure } from "../../widgets/figure/figure.js";
import { newHistory } from "../../widgets/history/history.js";
import "./ui/inspector.css";

/** How a figure is being looked at, as opposed to what it is looking at. */
export type Options = {
  /**
   * No state is current: the whole schema is on the table and nothing fires. Off, the machine
   * stands somewhere, everything out of its reach is dim and does not even answer the pointer,
   * and naming both halves of a transition takes it.
   *
   * Where it starts. Afterwards the mode is the machine below, and `set` moves it.
   */
  exploring?: boolean;
  /** Share the looking with something else on the page — an editor, another figure. */
  focus?: Focus;
  /**
   * Share the mode, for the same reason: a page with a switch of its own has other things to
   * redraw when it moves — a button that is not offered while exploring, a gutter that marks
   * nothing — and they should be listening to the mode rather than to the switch.
   */
  mode?: Mode;
};

export type Handle = {
  /** Draw again, because something about the subject changed. */
  readonly update: () => void;
  /** Look at it differently. */
  readonly set: (opts: Options) => void;
  /** Let go: listeners, and the DOM this put in the host. */
  readonly destroy: () => void;
};

/** Where a figure with no current state starts counting from. */
const firstOf = (graph: Graph) => Object.keys(graph)[0] ?? "";

export function mount(
  host: HTMLElement,
  subject: Subject,
  options: Options = {},
): Handle {
  const mode = options.mode ?? newMode();
  // Where it starts, said as the event that would take it there. Being told what is already true
  // is no rule of that machine, so this is a transition or it is nothing.
  mode.dispatch("read", { whole: options.exploring ?? false });
  const focus = options.focus ?? newFocus();

  /**
   * Let the figure go.
   *
   * What it holds is about one graph, one position of the machine and one way of looking. Change
   * any of those and the halves it holds name something that is no longer there — so everything
   * that changes one of them says this, and nothing else has to think about it. The pointer goes
   * with them: whatever it was over is about to be rebuilt, so no `mouseleave` is coming for it.
   */
  const forget = () => {
    // Said, not asked first. Whether there is anything to let go of is a question the schema
    // already answers — `drop` is in every state but `nothing` — and asking it here would be that
    // answer written down a second time, in a place that cannot be kept in step with it.
    focus.choice.dispatch("drop");
    focus.pointer.dispatch("leave");
  };

  const history = newHistory({
    subject,
    focus,
    mode,
    rewind: (step) => {
      subject.rewind?.(step);
      forget();
      paint();
    },
  });

  const figure = newFigure({ subject, focus, mode, forget });

  // The figure, and what happened on it — beside it or under it, which `fit` decides.
  const work = make("div", "work");
  work.append(figure.node, history.node);
  const root = make("div", "fsmjs-inspector");
  root.append(work);
  host.append(root);

  /**
   * Where the run starts — fixed for as long as this mount lives, and not wherever the machine
   * happens to be standing.
   *
   * Everything about the *shape* of the figure is read from it: `lanes` orders the axis breadth
   * first from the start, and that order is the order of the columns, of the rows, and of the
   * colours. Recomputing it from `subject.at` on every repaint, which is what this did, re-sorted
   * the whole figure under the machine after every step — so the dot marking where it stands
   * stayed in the same row wearing the same colour while the row underneath became a different
   * state, and the text beside it, whose colours come from the start, disagreed with all of it.
   *
   * What moves when the machine moves is the mark. Nothing else has any business moving.
   */
  const start = subject.at || firstOf(subject.graph);

  /**
   * Where the history goes: beside the figure when the figure still fits whole, under it when it
   * does not.
   *
   * This cannot be a media query, because the question is not how wide the window is — it is
   * whether *this* schema fits in what is left after the history takes its column, and a schema
   * six states wide and one thirty states wide are different answers on the same screen. So it is
   * measured: what the board came out at, against the room there is. The figure is what the tool
   * is for, and it is never the thing that gets cut.
   */
  function fit(): void {
    const style = getComputedStyle(work);
    // Both in pixels: the stylesheet declares the width in the unit its reader can use.
    const min = parseFloat(style.getPropertyValue("--history-min")) || 0;
    const gap = parseFloat(style.columnGap) || 0;
    const board = figure.width();
    // The column is the board, so the figure is shown whole or not at all — a column of `1fr`
    // would give a five-state schema the width of the page and stand the history a screen away
    // from it.
    work.style.setProperty("--board", `${board}px`);
    work.classList.toggle(
      "beside",
      !history.node.hidden && work.clientWidth >= board + gap + min,
    );
  }

  function paint(): void {
    // The two are drawn on the same rows, in the same order, starting the same distance down —
    // which is a constant now that the figure hangs its indices below its grid, so neither has to
    // be laid out before the other.
    figure.draw(start);
    history.show(subject.graph, start);
    history.draw();
    fit();
  }

  // The room changes with the window, and what fits in it changes with the room.
  const watching = new ResizeObserver(() => fit());
  watching.observe(work);

  const off: (() => void)[] = [
    figure.stop,
    history.stop,
    // The mode moved, so what is on the table did. Whatever was held names a rule in a mode that
    // is over — the same reason every other change of ground says `forget` first.
    mode.rx.on(TRANSITION, () => {
      forget();
      paint();
    }),
    () => watching.disconnect(),
    subject.watch(() => paint()),
    /**
     * Both halves are named, so a rule has been named — and naming a rule is what takes it. The
     * choice machine says only that it happened; which rule the two cells come down to and
     * whether the machine can take it are questions about the subject, and they are asked in one
     * place for the figure and the text alike.
     */
    focus.choice.rx.on("took", ({ cause, effect }) => {
      // After the press, not inside it: this arrives while the choice is still dispatching, and
      // both of the things to do now are dispatches of their own — one moves the machine, the
      // other lets the choice go. The library forbids nesting them, and is right to.
      queueMicrotask(() => {
        const id = between(subject, edges(subject.graph), [cause, effect]);
        if (id) take(subject, id);
        // Whatever was held named a rule in a position the machine has now left.
        forget();
      });
    }),
  ];

  const onKey = (e: KeyboardEvent) => {
    // Esc lets a selection go all at once, where pressing a named half walks it back one step.
    if (e.key === "Escape") forget();
  };
  document.addEventListener("keydown", onKey);

  paint();

  return {
    update: paint,
    set: (opts) => {
      // One line, and no `if`: told the mode it is already in, the machine has no rule for it and
      // nothing is redrawn. Told the other, its own listener does the forgetting and the drawing.
      if (opts.exploring !== undefined)
        mode.dispatch("read", { whole: opts.exploring });
    },
    destroy: () => {
      for (const it of off) it();
      document.removeEventListener("keydown", onKey);
      root.remove();
    },
  };
}

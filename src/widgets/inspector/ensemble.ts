/**
 * The binder: independent widgets collected into one object, on one subject and focus.
 *
 * A composite slice: it names its sibling widgets' classes — the `@x` kind of cross-import,
 * types off their public modules and nothing deeper.
 *
 * Each widget hears the subject itself and draws itself; the binder adds the mapping between
 * them. A rule named on any surface is taken here, once; a rewind asked on any surface moves the
 * one recorder; a change of the graph redraws every member; a move of the focus
 * re-dresses them. A page composes the cast and hands it over — no page wires widgets to each
 * other directly.
 */
import { edges } from "@evgkch/fsmjs";
import type { Subject } from "../../entities/machine/index.js";
import type { RuleId } from "../../entities/machine/index.js";
import { newFocus } from "../../features/focus/index.js";
import type { Focus } from "../../features/focus/index.js";
import { between, canFire, take } from "../../features/take-rule/index.js";
import { rowOf } from "../../shared/lang/rules.js";
import type { FsmjsDiagram } from "../diagram/diagram.js";
import type { FsmjsFigure } from "../figure/figure.js";
import type { FsmjsHistory } from "../history/history.js";

/** Anything that draws the subject and answers the focus. */
export type Surface = {
  draw(start: string): void;
  dress(): void;
};

/** A widget that takes the standard wiring itself; a bare surface is enrolled as it is. Beyond
 * the shared trio, the wiring carries the binder's actions — a member picks what it answers. */
export type Member = Surface & {
  wiring?: {
    subject: Subject;
    focus: Focus;
    forget?: () => void;
    fire?: (id: RuleId) => void;
    rewind?: (step: number) => void;
  };
};

/** The widgets a page brings; any of them may be absent. */
export type Cast = {
  figure?: FsmjsFigure;
  history?: FsmjsHistory;
  diagram?: FsmjsDiagram;
};

export type Ensemble = {
  readonly focus: Focus;
  /** Where the members count their rows from. */
  readonly start: string;
  /** Redraw every member. */
  readonly draw: () => void;
  /** Re-dress every member: the focus moved, nothing else did. */
  readonly dress: () => void;
  /** Take a rule, if the machine can — the one place any surface's naming lands. */
  readonly fire: (id: RuleId) => void;
  /** Move the recorder, and let the naming go — it named a position that is gone. */
  readonly rewind: (step: number) => void;
  /** Drop the selection and the pointer. */
  readonly forget: () => void;
  /** One more member on the same subject and focus — wired here, drawn at once. */
  readonly enroll: (s: Member) => void;
  readonly destroy: () => void;
};

export function ensemble(
  subject: Subject,
  cast: Cast,
  options: { focus?: Focus; start?: string } = {},
): Ensemble {
  const focus = options.focus ?? newFocus();
  const start =
    options.start || subject.at || Object.keys(subject.graph)[0] || "";

  const forget = () => {
    focus.choice.dispatch("drop");
    focus.pointer.dispatch("leave");
  };

  const fire = (id: RuleId) => {
    if (!canFire(subject, id)) return;
    take(subject, id);
    // Whatever was held or pointed at named a position the machine has left.
    forget();
  };

  const rewind = (step: number) => {
    subject.rewind?.(step);
    forget();
  };

  // The members, wired. The order fixes the draw order and nothing else.
  const crew = new Set<Surface>();
  if (cast.figure) {
    cast.figure.wiring = { subject, focus, forget };
    crew.add(cast.figure);
  }
  if (cast.history) {
    const history = cast.history;
    history.wiring = { subject, focus, rewind };
    // The history counts its rows from the same start as everyone.
    crew.add({
      draw: (at) => {
        history.show(subject.graph, at);
        history.draw();
      },
      dress: () => history.dress(),
    });
  }
  if (cast.diagram) {
    cast.diagram.wiring = { subject, focus, fire };
    crew.add(cast.diagram);
  }

  const draw = () => {
    for (const s of crew) s.draw(start);
  };
  const dress = () => {
    for (const s of crew) s.dress();
  };

  const off = [
    // Both halves named, anywhere: the rule they come down to is taken here. Deferred — this
    // arrives mid-dispatch, and what follows are dispatches of their own.
    focus.choice.rx.on("took", ({ cause, effect }) => {
      queueMicrotask(() => {
        const id = between(subject, edges(subject.graph).map(rowOf), [
          cause,
          effect,
        ]);
        if (id) take(subject, id);
        forget();
      });
    }),
  ];

  return {
    focus,
    start,
    draw,
    dress,
    fire,
    rewind,
    forget,
    enroll: (s) => {
      if ("wiring" in s) s.wiring = { subject, focus, forget, fire, rewind };
      // A member with `show` is told the graph and the start before every draw — the history.
      const member: Surface =
        "show" in s && typeof s.show === "function"
          ? {
              draw: (at) => {
                (s.show as (g: unknown, at: string) => void)(subject.graph, at);
                s.draw(at);
              },
              dress: () => s.dress(),
            }
          : s;
      crew.add(member);
      member.draw(start);
    },
    destroy: () => {
      for (const it of off) it();
      crew.clear();
    },
  };
}

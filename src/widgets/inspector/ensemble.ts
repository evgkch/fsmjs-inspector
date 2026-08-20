/**
 * The binder: independent widgets collected into one object, on one subject and focus.
 *
 * The binder names no sibling widget. Every slot of the cast is described here by what the binder
 * does to it — a surface to draw, a wiring to write, and for the history the graph before the
 * draw — so the real widgets fit by their shape and a page may bring its own. The one `@x`
 * cross-import left in this slice is `mount`'s: a composite builds the widgets it lays out.
 *
 * Each widget hears the subject itself and draws itself; the binder adds the mapping between
 * them. A rule named on any surface is taken here, once; a rewind asked on any surface moves the
 * one recorder; a change of the graph redraws every member; a move of the focus
 * re-dresses them. A page composes the cast and hands it over — no page wires widgets to each
 * other directly.
 */
import { edges } from "@evgkch/fsmjs";
import type { Graph, RuleId, Subject } from "../../entities/machine/index.js";
import { newFocus } from "../../features/focus/index.js";
import type { Focus } from "../../features/focus/index.js";
import { between, canFire, take } from "../../features/take-rule/index.js";
import { rowOf } from "../../shared/lang/rules.js";

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

/** The figure's slot: a surface told the subject, the focus, and how to let the selection go. */
export type CastFigure = Surface & {
  wiring: { subject: Subject; focus: Focus; forget: () => void };
};

/** The history's slot: it moves the recorder, and it is told the graph and the start before every
 * draw — its rows are counted from the same place as everyone's. */
export type CastHistory = Surface & {
  wiring: { subject: Subject; focus: Focus; rewind: (step: number) => void };
  show(graph: Graph, at: string): void;
};

/** The diagram's slot: a rule named on it is taken here. The slot only has to accept the taking —
 * a diagram standing alone takes the rule itself. */
export type CastDiagram = Surface & {
  wiring: { subject: Subject; focus: Focus; fire?: (id: RuleId) => void };
};

/** The widgets a page brings; any of them may be absent. Slots are shapes, not classes: the
 * widgets of this library fit them, and so may a page's own. */
export type Cast = {
  figure?: CastFigure;
  history?: CastHistory;
  diagram?: CastDiagram;
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
        history.draw(at);
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

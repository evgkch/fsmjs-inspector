/**
 * Which panels are on screen.
 *
 * Three drawings of one machine — the source, the figure and the run — and a debugger that shows
 * all three at once is a debugger you read a third of. Which ones you want depends on what you are
 * looking for: a shape that will not close needs the figure, and a schema you are reading for the
 * first time needs the source beside it and nothing else.
 *
 * One state and one event. There is nowhere to go — every arrangement is the same kind of thing —
 * so what changes is the context, and the machine is here rather than in a page because two pages
 * show the same four panels and would otherwise each keep their own idea of which are up.
 *
 * Told to turn on what is already on, it has no rule: the guard refuses it, nothing transitions,
 * and nothing redraws. That is the same discipline as the mode's, and it is why every drawing can
 * hang off `TRANSITION` and trust that a transition means something changed.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

/** The three, by the names their panels wear. */
export type Panel = "code" | "figure" | "run";

export type Up = Record<Panel, boolean>;

export type Shown = Merge<IState<"showing", Up>>;

export type Asked = Merge<IEvent<"put", { panel: Panel; up: boolean }>>;

const showing: Schema<Shown, Asked, Record<string, never>> = {
  showing: { put: [{ when: news, to: ["showing", set] }] },
};

export type Panels = StateMachine<Shown, Asked, Record<string, never>>;

/** All three, because a reader who has not said otherwise is looking at the whole tool. */
export function newPanels(): Panels {
  return new StateMachine<Shown, Asked, Record<string, never>>(showing, {
    type: "showing",
    context: { code: true, figure: true, run: true },
  });
}

/** What the page writes on itself, so the stylesheet can hide what is down. */
export function offOf(it: Panels): string {
  const up = it.state.context;
  return (Object.keys(up) as Panel[]).filter((p) => !up[p]).join(" ");
}

// ── the guards ───────────────────────────────────────────────────────────────

function news(c: Up, p: { panel: Panel; up: boolean }): boolean {
  return c[p.panel] !== p.up;
}

function set(c: Up, p: { panel: Panel; up: boolean }): Up {
  return { ...c, [p.panel]: p.up };
}

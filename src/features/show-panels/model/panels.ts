/**
 * Which panels are on screen. One state, one event; the arrangement is the context. Told to turn
 * on what is already on, the guard refuses and nothing redraws — so `TRANSITION` always means a
 * change.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

/** A panel is named by the page that shows it; the machine takes any list of names. */
export type Panel = string;

export type Up = Record<Panel, boolean>;

export type Shown = Merge<IState<"showing", Up>>;

export type Asked = Merge<IEvent<"put", { panel: Panel; up: boolean }>>;

const showing: Schema<Shown, Asked, Record<string, never>> = {
  showing: { put: [{ when: news, to: ["showing", set] }] },
};

export type Panels = StateMachine<Shown, Asked, Record<string, never>>;

/** All named panels up: a reader who has not said otherwise sees the whole tool. */
export function newPanels(all: readonly Panel[]): Panels {
  return new StateMachine<Shown, Asked, Record<string, never>>(showing, {
    type: "showing",
    context: Object.fromEntries(all.map((p) => [p, true])),
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

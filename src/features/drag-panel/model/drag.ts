/**
 * Dragging the floating panel by its bar.
 *
 *   still ──pointerdown(on the bar)──▸ dragging ──pointermove ▸ put──▸ dragging
 *     ▴                                                                  │
 *     └──────────────────── pointerup ───────────────────────────────────┘
 *
 * A machine, not a closure with listeners: the state is readable, the offset is its context, and
 * the window listeners follow the state. Where the panel goes is an output event.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

export type Held = Merge<
  IState<"still"> | IState<"dragging", { dx: number; dy: number }>
>;

/** The pointer's events. `grab`: whether the bar itself was pressed, not a control on it. */
export type Pointing = Merge<
  | IEvent<
      "pointerdown",
      { x: number; y: number; left: number; top: number; grab: boolean }
    >
  | IEvent<"pointermove", { x: number; y: number }>
  | IEvent<"pointerup">
>;

/** Where the panel goes now. */
export type Puts = Merge<IEvent<"put", { left: number; top: number }>>;

const dragging: Schema<Held, Pointing, Puts> = {
  still: {
    pointerdown: [{ when: grabbed, to: ["dragging", hold] }],
  },
  dragging: {
    pointermove: [{ to: "dragging", emit: ["put", under] }],
    pointerup: [{ to: "still" }],
  },
};

export type Drag = StateMachine<Held, Pointing, Puts>;

export function newDrag(): Drag {
  return new StateMachine<Held, Pointing, Puts>(dragging, {
    type: "still",
    context: undefined,
  });
}

// ── the guard, and the two sums ──────────────────────────────────────────────

function grabbed(_: unknown, p: { grab: boolean }): boolean {
  return p.grab;
}

/** What the pointer took hold of: where in the panel it went down, kept for the whole drag. */
function hold(
  _: unknown,
  p: { x: number; y: number; left: number; top: number },
): { dx: number; dy: number } {
  return { dx: p.x - p.left, dy: p.y - p.top };
}

function under(
  c: { dx: number; dy: number },
  p: { x: number; y: number },
): { left: number; top: number } {
  return { left: p.x - c.dx, top: p.y - c.dy };
}

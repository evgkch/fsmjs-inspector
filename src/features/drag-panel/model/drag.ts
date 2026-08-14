/**
 * Dragging the floating panel by its bar.
 *
 *   still ──pointerdown(on the bar)──▸ dragging ──pointermove ▸ put──▸ dragging
 *     ▴                                                                  │
 *     └──────────────────── pointerup ───────────────────────────────────┘
 *
 * A drag is a state machine, and this tool ships one as a sample schema — `selection-rectangle`,
 * the first thing the page offers. Implementing its own drag as a closure that adds two listeners
 * on the way in and removes them on the way out would be the tool disagreeing with the thing it is
 * for. It would also hide the state where nothing can read it: "is a drag going on" would be the
 * presence of a listener, and the offset it is carrying would be two variables in a scope.
 *
 * So the state is a state and the offset is its context, and the listeners are a *drawing* of it:
 * the page listens for moves while the machine is dragging, the way the figure wears a class while
 * a cell is held. Where the panel goes is an output — the machine says where, the page puts it
 * there, and neither knows how the other does its half.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

export type Held = Merge<
  IState<"still"> | IState<"dragging", { dx: number; dy: number }>
>;

/**
 * The pointer's own events, with what the DOM knew at the time. `grab` is the one fact the machine
 * cannot see for itself: whether what went down was the bar, or one of the controls sitting on it.
 */
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

const grabbed = (_: unknown, p: { grab: boolean }) => p.grab;

/** What the pointer took hold of: where in the panel it went down, kept for the whole drag. */
const hold = (
  _: unknown,
  p: { x: number; y: number; left: number; top: number },
) => ({ dx: p.x - p.left, dy: p.y - p.top });

const under = (c: { dx: number; dy: number }, p: { x: number; y: number }) => ({
  left: p.x - c.dx,
  top: p.y - c.dy,
});

const dragging: Schema<Held, Pointing, Puts> = {
  still: {
    pointerdown: [{ to: "dragging", when: grabbed, with: hold }],
  },
  dragging: {
    pointermove: [{ to: "dragging", emit: "put", by: under }],
    pointerup: [{ to: "still" }],
  },
};

export type Drag = StateMachine<Held, Pointing, Puts>;

export const newDrag = (): Drag =>
  new StateMachine<Held, Pointing, Puts>(dragging, {
    type: "still",
    context: undefined,
  });

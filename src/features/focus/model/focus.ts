/**
 * What the reader is looking at: two small machines, and one function that reads them together.
 *
 * Two things go on at once and they are not the same thing. One is the *choice*: nothing held,
 * one half held, both held. The other is the *pointer*: away, or over some cell. Written as one
 * machine they multiply — a state for the pointer before a press and another for the pointer
 * after one — and then the two have to be kept saying the same thing by hand. They were not.
 * Pointing at a half worked before the first press and did nothing after it, which is not a rule
 * anybody asked for; it is what two copies of a rule do when only one of them gets edited.
 *
 * So they are two machines, and neither knows about the other:
 *
 *       press(half)          press(other half) ▸ took            enter(cell)
 *   nothing ─────────▸ half ─────────────────────────▸ whole      away ⇄ over
 *      ▴  ◀─press(same)  ▴  ◀──── press(either half) ──┘             leave
 *      └───── drop ──────┴─────────── drop ────────────┘
 *
 * There is exactly one `enter` rule and one `leave` rule on the whole page, so the pointer cannot
 * behave one way before a press and another way after: the pointer machine does not know a press
 * happened. Nor does it know *what* moved it — the figure's own cells and the editor's gutter
 * dispatch the same `enter`, which is why a rule lights the same way whichever of the two you are
 * over. Where the machines meet is `look`, in one line, and that line is the only place that can
 * ever decide what the pointer adds to what is held.
 *
 * The choice is three states because it carries three different things, and its guards are the
 * whole of its logic. `half` is a cell of three rules: the half already held, pressed again, lets
 * go; anything else is the other half, and which slot it lands in is not the order it was pressed
 * in but what it *is*, so there is one rule for each way round and nothing is worked out
 * afterwards. `whole` is that cell read backwards — pressing either named half drops that one and
 * keeps the other, so a choice walks back a step rather than all the way.
 *
 * `drop` is in every state but `nothing`, and it is not there for Esc. The figure is about one
 * graph, one position of the machine and one mode; change any of those and what is held names
 * something that is no longer there. Whoever changes one says `drop`, and that is the whole of
 * the reset — there is no state it can fail to reach from.
 *
 * Every operation here is a named function and not an inline one, and that is not a style. A
 * dump keeps the *name* of an operation and none of its code, so a machine whose guards are
 * anonymous dumps as a graph full of `?`. This machine's dump is one of the schemas the page
 * offers, and a schema that cannot say what decides its own cells is not worth reading.
 *
 * What neither machine knows is the mode. Running and exploring differ in which cells are on the
 * table and in what happens once both halves are named, and neither is a question about the
 * figure — the first is asked of the schema, the second of `took`.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";
import {
  CAUSE,
  EFFECT,
  HALVES,
  MIRROR,
  kindOf,
} from "../../../entities/cell/index.js";
import type { Key, Kind } from "../../../entities/cell/index.js";

// ── the choice: which halves of a transition are held ────────────────────────

export type Held = Merge<
  | IState<"nothing">
  | IState<"half", { end: Key }>
  | IState<"whole", { cause: Key; effect: Key }>
>;

export type Pressing = Merge<IEvent<"press", { key: Key }> | IEvent<"drop">>;

/** Both halves are named. Which rule that is, and what to do about it, is the listener's. */
export type Took = Merge<IEvent<"took", { cause: Key; effect: Key }>>;

/** A half of a transition — a crossing is a crossing, and a crossing is not something to hold. */
const isHalf = (_: unknown, p: { key: Key }) => kindOf(p.key) in MIRROR;
const same = (c: { end: Key }, p: { key: Key }) => c.end === p.key;

/** The half held is the cause and the one pressed the effect, or the other way round. */
const causeHeld = (c: { end: Key }, p: { key: Key }) =>
  kindOf(c.end) === CAUSE && kindOf(p.key) === EFFECT;
const effectHeld = (c: { end: Key }, p: { key: Key }) =>
  kindOf(c.end) === EFFECT && kindOf(p.key) === CAUSE;

const isCause = (c: { cause: Key }, p: { key: Key }) => c.cause === p.key;
const isEffect = (c: { effect: Key }, p: { key: Key }) => c.effect === p.key;

const hold = (_: unknown, p: { key: Key }) => ({ end: p.key });
const pairUp = (c: { end: Key }, p: { key: Key }) => ({
  cause: c.end,
  effect: p.key,
});
const pairDown = (c: { end: Key }, p: { key: Key }) => ({
  cause: p.key,
  effect: c.end,
});
const keepEffect = (c: { effect: Key }) => ({ end: c.effect });
const keepCause = (c: { cause: Key }) => ({ end: c.cause });
const both = (c: { cause: Key; effect: Key }) => ({
  cause: c.cause,
  effect: c.effect,
});

const choosing: Schema<Held, Pressing, Took> = {
  nothing: {
    press: [{ to: "half", when: isHalf, with: hold }],
  },
  half: {
    press: [
      { to: "nothing", when: same },
      { to: "whole", when: causeHeld, with: pairUp, emit: "took", by: both },
      { to: "whole", when: effectHeld, with: pairDown, emit: "took", by: both },
    ],
    drop: [{ to: "nothing" }],
  },
  whole: {
    press: [
      { to: "half", when: isCause, with: keepEffect },
      { to: "half", when: isEffect, with: keepCause },
    ],
    drop: [{ to: "nothing" }],
  },
};

// ── the pointer: which cell it is over ───────────────────────────────────────

/**
 * Where the pointer is: away, or over a *place* — and a place is one or more cells.
 *
 * One, when it is a cell of the figure that is being pointed at. Two, when it is a line of the
 * text: a line names a rule, and a rule is written in the figure twice, as its cause and as its
 * effect. The pointer does not know which of the two it got, and `look` does not either — they
 * both go into `shown`, and a rule is lit when every shown cell holds it, which for the two
 * halves of a rule is that rule and nothing else.
 *
 * What it does carry is whether the thing under it is being *offered*. A cell of the figure and a
 * line of the text are both an invitation: point at them and you may take them. A step of the
 * history is not — it is a rule being recalled, and one already taken. Both light the same cells,
 * because they are about the same rule; only one of them means "you could do this now".
 */
export type Where = Merge<
  IState<"away"> | IState<"over", { at: Key[]; offer: boolean }>
>;

export type Moving = Merge<
  IEvent<"enter", { keys: Key[]; offer: boolean }> | IEvent<"leave">
>;

/** The one `with` the pointer has: written once, and named by both of the rules that need it. */
const onto = (_: unknown, p: { keys: Key[]; offer: boolean }) => ({
  at: p.keys,
  offer: p.offer,
});

const moving: Schema<Where, Moving, Record<string, never>> = {
  away: {
    enter: [{ to: "over", with: onto }],
  },
  over: {
    // Moving from one cell to the next is one event, not a leave and an enter.
    enter: [{ to: "over", with: onto }],
    leave: [{ to: "away" }],
  },
};

// ── the two, read together ───────────────────────────────────────────────────

/**
 * How the figure looks, in one value. No reader of it has a case of its own.
 *
 *   `fixed`  what a press has committed to. A rule these disallow is off the table, and a cell
 *            holding only such rules goes dim.
 *   `shown`  what is lit, and what draws its bands. What is held and what is under the pointer
 *            land in the same list on purpose: a press keeps exactly the light pointing gave it,
 *            and pointing works the same before a press and after one.
 *   `open`   which half the next press is asked for.
 *   `offer`  whether what is under the pointer is on offer — a rule you could take now, rather
 *            than one being recalled from the run that has already happened.
 */
export type Look = {
  fixed: Key[];
  shown: Key[];
  open: Kind[];
  offer: boolean;
};

/**
 * One focus per figure, not one per page — but one focus for a figure *and* the text beside it.
 * Two inspectors on a screen are two of these, and a pointer over one of them says nothing about
 * the other; the editor and the figure showing the same machine are one, and that is why hovering
 * a cell lights a line.
 */
export type Focus = {
  readonly choice: StateMachine<Held, Pressing, Took>;
  readonly pointer: StateMachine<Where, Moving, Record<string, never>>;
  /** How it looks right now. */
  readonly look: () => Look;
};

export function newFocus(): Focus {
  const choice = new StateMachine<Held, Pressing, Took>(choosing, {
    type: "nothing",
    context: undefined,
  });
  const pointer = new StateMachine<Where, Moving, Record<string, never>>(
    moving,
    { type: "away", context: undefined },
  );
  return { choice, pointer, look: () => look(choice, pointer) };
}

const look = (
  choice: StateMachine<Held, Pressing, Took>,
  pointer: StateMachine<Where, Moving, Record<string, never>>,
): Look => {
  const held = choice.state;
  const fixed =
    held.type === "half"
      ? [held.context.end]
      : held.type === "whole"
        ? [held.context.cause, held.context.effect]
        : [];
  // Whatever the pointer is over is shown. That is the whole rule — over a half or over a
  // crossing, with a half held or with nothing held. The one exception is a choice with nothing
  // left to decide: both halves are named, and a third constraint could only empty the set.
  const over =
    held.type !== "whole" && pointer.state.type === "over"
      ? pointer.state.context.at
      : [];
  return {
    fixed,
    offer:
      held.type !== "whole" &&
      pointer.state.type === "over" &&
      pointer.state.context.offer,
    // A set, because the pointer is usually still over the cell that was just pressed: the same
    // key twice would draw the same band twice, and two translucent bands on one row are darker
    // than one for no reason a reader could ever work out.
    shown: [...new Set([...fixed, ...over])],
    open:
      held.type === "half"
        ? [MIRROR[kindOf(held.context.end)]!]
        : held.type === "whole"
          ? []
          : HALVES,
  };
};

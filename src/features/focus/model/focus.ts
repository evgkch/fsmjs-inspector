/**
 * What the reader is looking at: two machines, read together by `look`.
 *
 *       press(half)          press(other half) ▸ took            enter(cell)
 *   nothing ─────────▸ half ─────────────────────────▸ whole      away ⇄ over
 *      ▴  ◀─press(same)  ▴  ◀──── press(either half) ──┘             leave
 *      └───── drop ──────┴─────────── drop ────────────┘
 *
 * The *choice* holds nothing, one half, or both; the *pointer* is away or over a place. They are
 * separate machines, neither knowing about the other, so pointing behaves the same before and
 * after a press. A source — a state pressed on the diagram — is held like a half; a second
 * source completes the pair as the corner the two make — the same state twice makes the corner
 * of its own transition. A pressed half moves a held source, and a pressed source moves a held
 * half. The figure's cells and the editor's gutter dispatch the same `enter`. `drop` is
 * a rule of every state but `nothing`: whoever changes the graph, the position or the mode says
 * it. Every operation is a named function so this machine's own dump reads without `?`. Whether a
 * cell is in reach arrives with the press as `alive`; what to do once both halves are named is
 * `took`, and the listener's.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";
import {
  CAUSE,
  CORNER,
  EFFECT,
  HALVES,
  MIRROR,
  SOURCE,
  keyOf,
  kindOf,
} from "../../../entities/cell/index.js";
import type { Key, Kind } from "../../../entities/cell/index.js";

// ── the choice: which halves of a transition are held ────────────────────────

export type Held = Merge<
  | IState<"nothing">
  | IState<"half", { end: Key }>
  | IState<"whole", { cause: Key; effect: Key }>
>;

/**
 * A press, and whether what was pressed is still in reach — a fact of the subject and the mode,
 * which this machine knows neither of, so it arrives with the event and a guard reads it.
 */
export type Pressing = Merge<
  IEvent<"press", { key: Key; alive: boolean }> | IEvent<"drop">
>;

/** Both halves are named. Which rule that is, and what to do about it, is the listener's. */
export type Took = Merge<IEvent<"took", { cause: Key; effect: Key }>>;

const choosing: Schema<Held, Pressing, Took> = {
  nothing: {
    press: [{ when: isHalf, to: ["half", hold] }],
  },
  half: {
    press: [
      // Sources first: the same state twice is the self-pair, not a let-go — `drop` lets go.
      { when: sourcePair, to: ["whole", corner], emit: ["took", both] },
      { to: "nothing", when: same },
      { when: causeHeld, to: ["whole", pairUp], emit: ["took", both] },
      { when: effectHeld, to: ["whole", pairDown], emit: ["took", both] },
      { when: swap, to: ["half", hold] },
    ],
    drop: [{ to: "nothing" }],
  },
  whole: {
    press: [
      { when: isCause, to: ["half", keepEffect] },
      { when: isEffect, to: ["half", keepCause] },
    ],
    drop: [{ to: "nothing" }],
  },
};

// ── the pointer: which cell it is over ───────────────────────────────────────

/**
 * Where the pointer is: away, or over a place of one or more cells — one for a figure cell, two
 * for a text line, which names both halves of its rule. `offer` says whether the thing under it
 * can be taken now; a step of the history lights the same cells but is not an offer.
 */
export type Where = Merge<
  IState<"away"> | IState<"over", { at: Key[]; offer: boolean }>
>;

export type Moving = Merge<
  | IEvent<"enter", { keys: Key[]; offer: boolean; alive: boolean }>
  | IEvent<"leave">
>;

const moving: Schema<Where, Moving, Record<string, never>> = {
  away: {
    enter: [{ when: named, to: ["over", onto] }],
  },
  over: {
    // Moving from one cell to the next is one event, not a leave and an enter.
    enter: [{ when: named, to: ["over", onto] }],
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
 * One focus per figure-plus-text, not per page: two inspectors on a screen are two of these; an
 * editor and figure showing the same machine share one.
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

function look(
  choice: StateMachine<Held, Pressing, Took>,
  pointer: StateMachine<Where, Moving, Record<string, never>>,
): Look {
  const held = choice.state;
  const fixed =
    held.type === "half"
      ? [held.context.end]
      : held.type === "whole"
        ? [held.context.cause, held.context.effect]
        : [];
  // The one join rule: with both halves named the pointer stops adding anything — a third cell
  // could only empty the set. Written once, here.
  const over =
    held.type !== "whole" && pointer.state.type === "over"
      ? pointer.state.context
      : null;
  return {
    fixed,
    // A press was an offer when it was made — `alive` guarded it — so a hold with the pointer
    // away still is one.
    offer: over?.offer ?? fixed.length > 0,
    // A set: the pointer is usually still over the pressed cell, and a duplicate key would draw
    // its band twice.
    shown: [...new Set([...fixed, ...(over?.at ?? [])])],
    // A held source has no mirror: it fixes no half, so both are still asked for.
    open:
      held.type === "half"
        ? (mirror(held.context.end) ?? HALVES)
        : held.type === "whole"
          ? []
          : HALVES,
  };
}

// ── the operations, declared after the schemas that name them ────────────────

/** The other half as a list, or nothing to mirror. */
function mirror(key: Key): Kind[] | null {
  const kind = MIRROR[kindOf(key)];
  return kind ? [kind] : null;
}

/** A half of a transition or a source, still in reach — a crossing cannot be held. */
function isHalf(_: unknown, p: { key: Key; alive: boolean }): boolean {
  const kind = kindOf(p.key);
  return p.alive && (kind in MIRROR || kind === SOURCE);
}

/** A held source and a pressed one: out of the first state, into the second. */
function sourcePair(c: { end: Key }, p: { key: Key; alive: boolean }): boolean {
  return p.alive && kindOf(c.end) === SOURCE && kindOf(p.key) === SOURCE;
}

/** A source against a half, either way round: no pair to make, the press moves the hold. */
function swap(c: { end: Key }, p: { key: Key; alive: boolean }): boolean {
  return (
    isHalf(c, p) && (kindOf(c.end) === SOURCE) !== (kindOf(p.key) === SOURCE)
  );
}

/** The corner the two sources make. `took` carries two keys; here they are the same one. */
function corner(c: { end: Key }, p: { key: Key }): { cause: Key; effect: Key } {
  const at = keyOf(CORNER, c.end.split("\0")[1]!, p.key.split("\0")[1]!);
  return { cause: at, effect: at };
}

function same(c: { end: Key }, p: { key: Key }): boolean {
  return c.end === p.key;
}

/** The half held is the cause and the one pressed the effect, or the other way round. */
function causeHeld(c: { end: Key }, p: { key: Key; alive: boolean }): boolean {
  return p.alive && kindOf(c.end) === CAUSE && kindOf(p.key) === EFFECT;
}

function effectHeld(c: { end: Key }, p: { key: Key; alive: boolean }): boolean {
  return p.alive && kindOf(c.end) === EFFECT && kindOf(p.key) === CAUSE;
}

function isCause(c: { cause: Key }, p: { key: Key }): boolean {
  return c.cause === p.key;
}

function isEffect(c: { effect: Key }, p: { key: Key }): boolean {
  return c.effect === p.key;
}

function hold(_: unknown, p: { key: Key }): { end: Key } {
  return { end: p.key };
}

function pairUp(c: { end: Key }, p: { key: Key }): { cause: Key; effect: Key } {
  return { cause: c.end, effect: p.key };
}

function pairDown(
  c: { end: Key },
  p: { key: Key },
): { cause: Key; effect: Key } {
  return { cause: p.key, effect: c.end };
}

function keepEffect(c: { effect: Key }): { end: Key } {
  return { end: c.effect };
}

function keepCause(c: { cause: Key }): { end: Key } {
  return { end: c.cause };
}

function both(c: { cause: Key; effect: Key }): { cause: Key; effect: Key } {
  return { cause: c.cause, effect: c.effect };
}

/** Something to point at: named cells that are still in reach. Otherwise the pointer stays. */
function named(_: unknown, p: { keys: Key[]; alive: boolean }): boolean {
  return p.alive && p.keys.length > 0;
}

/** The pointer's one `with`, named by both rules that need it. */
function onto(
  _: unknown,
  p: { keys: Key[]; offer: boolean },
): { at: Key[]; offer: boolean } {
  return { at: p.keys, offer: p.offer };
}

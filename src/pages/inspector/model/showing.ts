/**
 * What is on screen: whether a board has been drawn, and where the run stands beside it.
 *
 *                 measured(fits)                       measured(tight)
 *   blank ──moved ▸ redraw──▸ ⋯ ──────────────▸ beside ⇄ under
 *     │                            measured(fits)   │      │
 *     └── measured ▸ aside / below ────────────────┘      │
 *                          looked ▸ redress ──────────────┘
 *
 * The figure is *redrawn* when the machine it shows moves and merely *re-dressed* when the reader
 * looks somewhere else. Those are two different events costing two different amounts, and telling
 * them apart is the whole reason this is not one repaint function — but it was told apart by an
 * optional chain on a callback that happened to be null before the first draw. That is a state
 * written as a `?.`, and this is the state: `blank` has no `looked` rule, so there is nothing to
 * dress before there is something drawn, and nothing has to remember that.
 *
 * Where the run goes is the other half, and it is a *state* rather than a measurement repeated on
 * every tick. The question is not how wide the window is: it is whether *this* board still fits in
 * what is left after the run takes its column, and a schema six states wide and one thirty states
 * wide are different answers on the same screen. So the room is measured and handed in, and the
 * two guards decide — with no rule for being told what is already true, so a window dragged across
 * a hundred pixels moves nothing at all unless it moves the answer.
 *
 * The figure is what the tool is for, and it is never the thing that gets cut: `beside` is only
 * reachable while the whole board fits, so the run goes under it rather than the figure narrowing.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

/** How wide the board came out, which is what the column it stands in is set to. */
type Wide = { board: number };

export type Showing = Merge<
  IState<"blank"> | IState<"under", Wide> | IState<"beside", Wide>
>;

/**
 * The facts, measured. `run` is whether there is a run to place at all — exploring there is none,
 * and a board that fits beside nothing is a board that fits.
 */
export type Told = Merge<
  | IEvent<"moved">
  | IEvent<"looked">
  | IEvent<
      "measured",
      { board: number; room: number; gap: number; min: number; run: boolean }
    >
>;

export type Shows = Merge<
  | IEvent<"redraw">
  | IEvent<"redress">
  | IEvent<"aside", Wide>
  | IEvent<"below", Wide>
>;

/**
 * Read in order, and the order is the argument: the second rule of each cell is reached only when
 * the first was refused, so it means "still the way it was — but is it the same width".
 */
const showing: Schema<Showing, Told, Shows> = {
  blank: {
    moved: [{ to: "blank", emit: "redraw" }],
    measured: [
      { when: fits, to: ["beside", sized], emit: ["aside", wide] },
      { to: ["under", sized], emit: ["below", wide] },
    ],
  },
  under: {
    moved: [{ to: "under", emit: "redraw" }],
    looked: [{ to: "under", emit: "redress" }],
    measured: [
      { when: fits, to: ["beside", sized], emit: ["aside", wide] },
      { when: grew, to: ["under", sized], emit: ["below", wide] },
    ],
  },
  beside: {
    moved: [{ to: "beside", emit: "redraw" }],
    looked: [{ to: "beside", emit: "redress" }],
    measured: [
      { when: tight, to: ["under", sized], emit: ["below", wide] },
      { when: grew, to: ["beside", sized], emit: ["aside", wide] },
    ],
  },
};

export type Sight = StateMachine<Showing, Told, Shows>;

export function newSight(): Sight {
  return new StateMachine<Showing, Told, Shows>(showing, {
    type: "blank",
    context: undefined,
  });
}

// ── the operations, below the schema ─────────────────────────────────────────
//
// Declarations, and after the rules rather than before them: that is the order the thing was
// designed in — the states, then what may happen in each, then whatever those rules turned out to
// need.

type Room = {
  board: number;
  room: number;
  gap: number;
  min: number;
  run: boolean;
};

/** Whole, and with room to spare for the run: both, or it does not fit. */
function fits(_: unknown, p: Room): boolean {
  return p.run && p.room >= p.board + p.gap + p.min;
}

function tight(_: unknown, p: Room): boolean {
  return !fits(_, p);
}

/** The same arrangement, a different board: a schema that grew still has to be given its width. */
function grew(c: Wide, p: Room): boolean {
  return c.board !== p.board;
}

function sized(_: unknown, p: Room): Wide {
  return { board: p.board };
}

function wide(c: Wide): Wide {
  return { board: c.board };
}

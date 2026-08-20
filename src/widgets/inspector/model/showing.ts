/**
 * What is on screen: whether a board has been drawn, and where the run stands beside it.
 *
 *                 measured(fits)                       measured(tight)
 *   blank ──moved ▸ redraw──▸ ⋯ ──────────────▸ beside ⇄ under
 *     │                            measured(fits)   │      │
 *     └── measured ▸ aside / below ────────────────┘      │
 *                          looked ▸ redress ──────────────┘
 *
 * Redraw (the machine moved) and redress (the looking changed) cost differently, so they are
 * separate events; `blank` has no `looked` rule, so nothing is dressed before it is drawn. The
 * run's placement is a state: the room is measured and handed in, the guards decide, and being
 * told what is already true is no transition. `beside` is reachable only while the whole board
 * fits — the run moves under it, the figure never narrows.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

/** How wide the board came out, which is what the column it stands in is set to. */
type Wide = { board: number };

export type Showing = Merge<
  IState<"blank"> | IState<"under", Wide> | IState<"beside", Wide>
>;

/**
 * The facts, measured.
 */
export type Told = Merge<
  | IEvent<"moved">
  | IEvent<"looked">
  | IEvent<
      "measured",
      { board: number; room: number; gap: number; min: number }
    >
>;

export type Shows = Merge<
  | IEvent<"redraw">
  | IEvent<"redress">
  | IEvent<"aside", Wide>
  | IEvent<"below", Wide>
>;

// The second rule of each `measured` cell is reached only when the first was refused: same
// arrangement, possibly a new width.
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

// ── the operations, declared after the schema that names them ────────────────

type Room = {
  board: number;
  room: number;
  gap: number;
  min: number;
};

/** Whole, and with room to spare for the run: both, or it does not fit. */
function fits(_: unknown, p: Room): boolean {
  return p.room >= p.board + p.gap + p.min;
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

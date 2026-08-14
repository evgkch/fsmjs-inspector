/**
 * Writing the schema: what the editor is doing besides holding text.
 *
 *            see(a word)                         press                  retype(inside) ▸ rewritten
 *   plain ──────────────▸ ahead ──take ▸ filled     picked ──────▸ renaming ──────────────┐
 *     ▴ ◀── see(nothing) ──┤                          ▴ ▸ armed      │                    │
 *     └──── hide / drop ───┴──────────────────────────┴──── drop ────┴─ retype(elsewhere) ┘
 *
 * `pick` is allowed from all four: naming a word is naming a word wherever the reader was.
 *
 * One machine and not two, and the reason is the arrow that is missing. There is no `see` out of
 * `renaming`: while a name is being retyped in every line it stands in, nothing is offered to
 * finish the word under the caret — being shown a *different* name in the middle of writing one is
 * the last thing that mode wants. Written as two machines, that fact has to be said by hand, in
 * whichever of the two remembers to ask the other; and a rule of one machine living inside another
 * is a rule that gets edited once and holds in one direction. Here it is not a rule at all. It is
 * an absence: the state has no such transition, so the offer cannot appear, and nothing had to
 * decide that.
 *
 * The two are one thing anyway. Both are the tool knowing the language and the schema well enough
 * not to make you type either twice, and both are *modes of writing* — which is to say they are
 * exclusive, unlike the pointer and the choice next door in `focus`, which are simultaneous and
 * are therefore two machines. Exclusive things share a machine; simultaneous things do not.
 *
 * What `renaming` carries is what makes it exact. `base` is the text as it stood when the mode was
 * armed and `word` the name as it stood in it: every keystroke rewrites the whole text from those
 * two and the letters typed so far, so no keystroke depends on the one before it. Backspacing to
 * nothing and typing something else is the same computation as the first letter, and the offsets —
 * `at`, and how many occurrences stand before it — are read once, from a text that never moves
 * under them.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";
import type { Ahead } from "../../../shared/lang/complete.js";
import { hits, swap } from "../../../shared/lang/names.js";
import { WORDS } from "../../../shared/lang/rules.js";

/**
 * What would finish the word under the caret: the word, the line it is on — where the ghost goes —
 * and where the caret was. The offset is here so that taking the offer is an event with no payload
 * at all: everything the edit needs, the state already holds.
 */
export type Offer = Ahead & { line: number; at: number };

/** A name being retyped in every line it stands in. */
export type Rewrite = {
  /** The name as it was, which is what is being replaced. */
  word: string;
  /** Where the one under the caret stands in `base`. */
  at: number;
  /** How many of them stand before it, which is how far the caret has moved by now. */
  before: number;
  /** The text as it was when this began. Every keystroke is computed from it. */
  base: string;
  /** What has been typed in its place so far. */
  now: string;
};

export type Written = Merge<
  | IState<"plain">
  | IState<"ahead", Offer>
  | IState<"picked", { word: string; at: number; to: number }>
  | IState<"renaming", Rewrite>
>;

/**
 * What happens to a text, as events — and every one of them is something that *happened*, not
 * something to do. A keystroke says where the caret was and what the text now reads, not whether
 * it was inside the name being renamed; the button says it was pressed, not which of the two
 * things pressing it means. Deciding those is what the rules below are for, and a caller that
 * decided them first would be a second copy of them, kept in step by hand.
 */
export type Typing = Merge<
  | IEvent<"see", { at: Offer | null }>
  | IEvent<"hide">
  | IEvent<"pick", { word: string; at: number; to: number }>
  | IEvent<"press", { base: string }>
  | IEvent<"take">
  | IEvent<"retype", { text: string; caret: number; end: number }>
  | IEvent<"drop">
>;

/**
 * What the machine asks for in return: three edits, each one worked out from what it holds. The
 * editor performs them and knows nothing about why — the same shape as `took` in `focus`, where
 * naming both halves of a transition is the machine's business and taking it is the page's.
 */
export type Says = Merge<
  | IEvent<"armed", { from: number; to: number }>
  | IEvent<"filled", { from: number; to: number; text: string }>
  | IEvent<"rewritten", { text: string; caret: number }>
>;

/** A keystroke, as the DOM has it. */
type Keyed = { text: string; caret: number; end: number };

// ── what the caret is over ───────────────────────────────────────────────────

const nothing = (_: unknown, p: { at: Offer | null }) => p.at === null;
const something = (_: unknown, p: { at: Offer | null }) => p.at !== null;
const seen = (_: unknown, p: { at: Offer | null }) => p.at as Offer;

/** Written once and named by every state that reads the caret, which is every state but one. */
const looking = [
  { to: "plain" as const, when: nothing },
  { to: "ahead" as const, when: something, with: seen },
];

// ── the name under the double-click ──────────────────────────────────────────

/**
 * What can be renamed: a name, and not a word of the language. Renaming `FROM` would not be a
 * rename — it would be a different language, and the reader would stop at the first line.
 */
const isName = (_: unknown, p: { word: string }) =>
  p.word.length > 0 &&
  !/\s/.test(p.word) &&
  !(WORDS as readonly string[]).includes(p.word);

const picking = (_: unknown, p: { word: string; at: number; to: number }) => ({
  word: p.word,
  at: p.at,
  to: p.to,
});

/** The text stops moving here: where the word stands in it is counted once, from this text. */
const arming = (
  c: { word: string; at: number },
  p: { base: string },
): Rewrite => ({
  word: c.word,
  at: c.at,
  before: hits(p.base, c.word).filter((i) => i < c.at).length,
  base: p.base,
  now: c.word,
});

/**
 * Where the word being retyped now stands, and the text it now stands in — both out of the same
 * two numbers, so the caret cannot end up somewhere the text does not say.
 */
const spread = (r: Rewrite): { text: string; at: number } => ({
  text: swap(r.base, r.word, r.now),
  at: r.at + r.before * (r.now.length - r.word.length),
});

/**
 * Was this keystroke inside the name being retyped.
 *
 * A guard, and not a check the caller makes before choosing what to send: everything before the
 * caret and everything after it has to still read as the mode last wrote it, or the reader has
 * gone somewhere else and the mode is over. Written outside, this decides *which event to
 * dispatch*, and then the schema is no longer the whole of what the mode does.
 */
const inside = (c: Rewrite, p: Keyed) => {
  const held = spread(c);
  const typed = p.text.slice(held.at, p.caret);
  return (
    p.caret >= held.at &&
    p.caret === p.end &&
    !/\s/.test(typed) &&
    p.text.slice(0, held.at) === held.text.slice(0, held.at) &&
    p.text.slice(p.caret) === held.text.slice(held.at + c.now.length)
  );
};

const typing = (c: Rewrite, p: Keyed): Rewrite => ({
  ...c,
  now: p.text.slice(spread(c).at, p.caret),
});

/** The word left selected, so that typing replaces it — which is what the mode is for. */
const selecting = (c: Rewrite) => ({ from: c.at, to: c.at + c.word.length });

/** The whole text with the name replaced everywhere, and where the caret goes in it. */
const rewriting = (c: Rewrite) => {
  const now = spread(c);
  return { text: now.text, caret: now.at + c.now.length };
};

/** The offered word, in place of what has been typed of it, and the space after it. */
const filling = (c: Offer) => ({
  from: c.at - c.typed.length,
  to: c.at,
  text: `${c.word} `,
});

/** Naming a word is naming a word, wherever the reader was when they did it. */
const naming = [{ to: "picked" as const, when: isName, with: picking }];

const writing: Schema<Written, Typing, Says> = {
  plain: {
    see: looking,
    pick: naming,
  },
  ahead: {
    see: looking,
    hide: [{ to: "plain" }],
    pick: naming,
    // TAB, and the state does not change: what the machine knows about the word is still true —
    // it is the text that changes, and the `see` that follows the edit reads it again.
    take: [{ to: "ahead", emit: "filled", by: filling }],
  },
  picked: {
    // Typing on rather than pressing the button is an answer too: the word is let go, and what
    // the caret is over is read the way it is read everywhere else.
    see: looking,
    pick: naming,
    press: [{ to: "renaming", with: arming, emit: "armed", by: selecting }],
    drop: [{ to: "plain" }],
  },
  renaming: {
    retype: [
      {
        to: "renaming",
        when: inside,
        with: typing,
        emit: "rewritten",
        by: rewriting,
      },
      // Anywhere else, and the reader has moved on. It is the same event either way: the button
      // is one button and a keystroke is one keystroke, and which of two things it meant is a
      // question with an answer in here.
      { to: "plain" },
    ],
    press: [{ to: "plain" }],
    pick: naming,
    drop: [{ to: "plain" }],
  },
};

export type Writing = StateMachine<Written, Typing, Says>;

export const newWriting = (): Writing =>
  new StateMachine<Written, Typing, Says>(writing, {
    type: "plain",
    context: undefined,
  });

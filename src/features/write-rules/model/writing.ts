/**
 * Writing the schema: what the editor is doing besides holding text.
 *
 *                see(a word)                 pick(name)
 *      plain ⇄ ─────────────▸ ahead      ▸ picked ──arm(base)──▸ renaming
 *        ▴  ◀── see(nothing) ──┘ │           │ │                  │  │
 *        │       hide ───────────┘           │ └──── drop ────────┘  │
 *        └───────────────────────────────────┘   ◀── retype ─────────┘
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

/** What would finish the word under the caret, and the line it is on — where the ghost goes. */
export type Offer = Ahead & { line: number };

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

export type Typing = Merge<
  | IEvent<"see", { at: Offer | null }>
  | IEvent<"hide">
  | IEvent<"pick", { word: string; at: number; to: number }>
  | IEvent<"arm", { base: string }>
  | IEvent<"retype", { now: string }>
  | IEvent<"drop">
>;

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

const typing = (c: Rewrite, p: { now: string }): Rewrite => ({
  ...c,
  now: p.now,
});

/** Naming a word is naming a word, wherever the reader was when they did it. */
const naming = [{ to: "picked" as const, when: isName, with: picking }];

const writing: Schema<Written, Typing, Record<string, never>> = {
  plain: {
    see: looking,
    pick: naming,
  },
  ahead: {
    see: looking,
    hide: [{ to: "plain" }],
    pick: naming,
  },
  picked: {
    // Typing on rather than pressing the button is an answer too: the word is let go, and what
    // the caret is over is read the way it is read everywhere else.
    see: looking,
    pick: naming,
    arm: [{ to: "renaming", with: arming }],
    drop: [{ to: "plain" }],
  },
  renaming: {
    retype: [{ to: "renaming", with: typing }],
    pick: naming,
    drop: [{ to: "plain" }],
  },
};

export type Writing = StateMachine<Written, Typing, Record<string, never>>;

export const newWriting = (): Writing =>
  new StateMachine<Written, Typing, Record<string, never>>(writing, {
    type: "plain",
    context: undefined,
  });

/**
 * The text as the rename has it now, and where in it the word under the caret stands. Both come
 * out of the same two numbers, so the caret cannot end up somewhere the text does not say.
 */
export const spread = (r: Rewrite): { text: string; at: number } => ({
  text: swap(r.base, r.word, r.now),
  at: r.at + r.before * (r.now.length - r.word.length),
});

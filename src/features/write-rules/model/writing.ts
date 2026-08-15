/**
 * Writing the schema: what the editor is doing besides holding text.
 *
 *   plain ⇄ ahead ──keydown(Tab) ▸ filled          picked ──press ▸ armed──▸ renaming
 *     ▴        │                                     ▴ │                      │ │
 *     │        └── blur ──┐   dblclick(a name) ───────┘ │   input(inside) ▸ rewritten
 *     └── input / moved(nothing) ──┴── keydown(Esc), mousedown(one click) ─────┘
 *
 * The events are the events the DOM has, and they arrive with the facts and nothing else: which
 * key, how many clicks, what the text now reads, where the caret is. *What they mean* is in here.
 * That is the whole point of writing this as a machine rather than as handlers — a handler that
 * tests the key, or the state, or the selection, and then picks which event to send has taken the
 * schema apart and spread it over the listeners, where the next reader has to reassemble it to
 * find out what a double-click does.
 *
 * So: `keydown` is one event, and whether this one was Escape and whether Escape means anything
 * where the writing is are two guards, both here. `input` is one event, and whether the keystroke
 * landed inside a name being retyped is a guard. `dblclick` is one event, and the word under it —
 * trimmed, checked against the language — is a guard and a `with`.
 *
 * One machine and not two, and the reason is the arrow that is missing. There is no `moved` out of
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
import { ahead } from "../../../shared/lang/complete.js";
import type { Ahead, Vocab } from "../../../shared/lang/complete.js";
import { hits, swap } from "../../../shared/lang/names.js";
import { WORDS } from "../../../shared/lang/rules.js";

/**
 * What the DOM knows when something happens in a textarea, and the whole of what is handed in.
 *
 * One shape for every event, because it is one thing — the state of the text and of the pointing
 * device at the moment something happened. An event that has no key comes with no key.
 */
export type Facts = {
  /** The key, when it was a keystroke. */
  key: string;
  /** How many clicks this one was, when it was a click. */
  clicks: number;
  text: string;
  caret: number;
  /** The other end of the selection; equal to the caret when nothing is selected. */
  end: number;
  /** The names the text has already used, as the last reading found them. */
  vocab: Vocab;
};

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
  | IEvent<"input", Facts>
  /** The caret may have moved: a key came up, a click landed, the box took the focus. */
  | IEvent<"moved", Facts>
  | IEvent<"keydown", Facts>
  | IEvent<"mousedown", Facts>
  | IEvent<"dblclick", Facts>
  | IEvent<"blur", Facts>
  /** The one button on this surface. */
  | IEvent<"press", Facts>
  /** Not from the DOM: a schema put into the editor from outside is a different text. */
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

/** Written once and named by every state that reads the caret, which is every state but one. */
const looking = [
  { to: "plain" as const, when: nothing },
  { when: something, to: ["ahead", seen] as const },
];

/** Naming a word is naming a word, wherever the reader was when they did it. */
const naming = [{ when: isName, to: ["picked", picking] as const }];

const writing: Schema<Written, Typing, Says> = {
  plain: {
    input: looking,
    moved: looking,
    dblclick: naming,
  },
  ahead: {
    input: looking,
    moved: looking,
    dblclick: naming,
    blur: [{ to: "plain" }],
    // TAB, and the state does not change: what the machine knows about the word is still true —
    // it is the text that changes, and the `moved` that follows the edit reads it again.
    keydown: [
      { when: tabbed, to: "ahead", emit: ["filled", filling] },
      { to: "plain", when: escaped },
    ],
    drop: [{ to: "plain" }],
  },
  picked: {
    // Typing on rather than pressing the button is an answer too: the word is let go, and what
    // the caret is over is read the way it is read everywhere else.
    input: looking,
    moved: looking,
    dblclick: naming,
    mousedown: [{ to: "plain", when: single }],
    keydown: [{ to: "plain", when: escaped }],
    press: [{ to: ["renaming", arming], emit: ["armed", selecting] }],
    drop: [{ to: "plain" }],
  },
  renaming: {
    input: [
      {
        when: inside,
        to: ["renaming", typing],
        emit: ["rewritten", rewriting],
      },
      // Anywhere else, and the reader has moved on. It is the same event either way: a keystroke
      // is a keystroke, and which of two things it meant is a question with an answer in here.
      { to: "plain" },
    ],
    dblclick: naming,
    mousedown: [{ to: "plain", when: single }],
    keydown: [{ to: "plain", when: escaped }],
    press: [{ to: "plain" }],
    drop: [{ to: "plain" }],
  },
};

export type Writing = StateMachine<Written, Typing, Says>;

export function newWriting(): Writing {
  return new StateMachine<Written, Typing, Says>(writing, {
    type: "plain",
    context: undefined,
  });
}

// ── the operations, below the schema ─────────────────────────────────────────
//
// Declarations, and after the rules rather than before them, because that is the order the thing
// was designed in: the states, then what may happen in each, then whatever those rules turned out
// to need. A file written the other way round asks its reader to hold a dozen small functions in
// mind before showing them what any of them is for.

// ── what the caret is over ───────────────────────────────────────────────────

/**
 * What would finish the word under the caret, or nothing.
 *
 * Only where the caret is at the end of a line and holding no selection, and that is a rule about
 * the two layers the editor draws rather than about the language: the ghost is a node in the
 * coloured layer, and a node in the middle of a line pushes the rest of that line sideways in one
 * layer and not in the other, which puts the caret off the word it is on.
 */
function offered(p: Facts): Offer | null {
  if (p.caret !== p.end) return null;
  const next = p.text[p.caret];
  if (next !== undefined && next !== "\n") return null;
  const upto = p.text.slice(0, p.caret).split("\n");
  const found = ahead(upto[upto.length - 1] ?? "", p.vocab);
  return found && { ...found, line: upto.length };
}

function nothing(_: unknown, p: Facts): boolean {
  return offered(p) === null;
}

function something(_: unknown, p: Facts): boolean {
  return offered(p) !== null;
}

function seen(_: unknown, p: Facts): Offer {
  return offered(p) as Offer;
}

/** The offered word, in place of what has been typed of it, and the space after it. */
function filling(
  c: Offer,
  p: Facts,
): { from: number; to: number; text: string } {
  return { from: p.caret - c.typed.length, to: p.caret, text: `${c.word} ` };
}

// ── the keys and the clicks, as they come ────────────────────────────────────

function escaped(_: unknown, p: Facts): boolean {
  return p.key === "Escape";
}

function tabbed(_: unknown, p: Facts): boolean {
  return p.key === "Tab";
}

/** A double-click is two clicks, and the second of them is the one that named the word. */
function single(_: unknown, p: Facts): boolean {
  return p.clicks === 1;
}

// ── the name under the double-click ──────────────────────────────────────────

/** The word the selection covers, trimmed of what a double-click sometimes takes with it. */
function under(p: Facts): { word: string; at: number } {
  const raw = p.text.slice(p.caret, p.end);
  const word = raw.trim();
  return { word, at: p.caret + raw.indexOf(word) };
}

/**
 * What can be renamed: a name, and not a word of the language. Renaming `FROM` would not be a
 * rename — it would be a different language, and the reader would stop at the first line.
 */
function isName(_: unknown, p: Facts): boolean {
  const { word } = under(p);
  return (
    word.length > 0 &&
    !/\s/.test(word) &&
    !(WORDS as readonly string[]).includes(word)
  );
}

function picking(
  _: unknown,
  p: Facts,
): { word: string; at: number; to: number } {
  const { word, at } = under(p);
  return { word, at, to: at + word.length };
}

// ── retyping it everywhere ───────────────────────────────────────────────────

/** The text stops moving here: where the word stands in it is counted once, from this text. */
function arming(c: { word: string; at: number }, p: Facts): Rewrite {
  return {
    word: c.word,
    at: c.at,
    before: hits(p.text, c.word).filter((i) => i < c.at).length,
    base: p.text,
    now: c.word,
  };
}

/**
 * Where the word being retyped now stands, and the text it now stands in — both out of the same
 * two numbers, so the caret cannot end up somewhere the text does not say.
 */
function spread(r: Rewrite): { text: string; at: number } {
  return {
    text: swap(r.base, r.word, r.now),
    at: r.at + r.before * (r.now.length - r.word.length),
  };
}

/**
 * Did this keystroke land inside the name being retyped: everything before the caret and
 * everything after it still reads as the mode last wrote it.
 */
function inside(c: Rewrite, p: Facts): boolean {
  const held = spread(c);
  const typed = p.text.slice(held.at, p.caret);
  return (
    p.caret >= held.at &&
    p.caret === p.end &&
    !/\s/.test(typed) &&
    p.text.slice(0, held.at) === held.text.slice(0, held.at) &&
    p.text.slice(p.caret) === held.text.slice(held.at + c.now.length)
  );
}

function typing(c: Rewrite, p: Facts): Rewrite {
  return { ...c, now: p.text.slice(spread(c).at, p.caret) };
}

/** The word left selected, so that typing replaces it — which is what the mode is for. */
function selecting(c: Rewrite): { from: number; to: number } {
  return { from: c.at, to: c.at + c.word.length };
}

/** The whole text with the name replaced everywhere, and where the caret goes in it. */
function rewriting(c: Rewrite): { text: string; caret: number } {
  const now = spread(c);
  return { text: now.text, caret: now.at + c.now.length };
}

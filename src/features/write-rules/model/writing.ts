/**
 * Writing the schema: what the editor is doing besides holding text.
 *
 *   plain ⇄ ahead ──keydown(Tab) ▸ filled          picked ──press ▸ armed──▸ renaming
 *     ▴        │                                     ▴ │                      │ │
 *     │        └── blur ──┐   dblclick(a name) ───────┘ │   input(inside) ▸ rewritten
 *     └── input / moved(nothing) ──┴── keydown(Esc), mousedown(one click) ─────┘
 *
 * Events are the DOM's, arriving with the facts only — key, clicks, text, caret; what they mean
 * is decided here by guards, not in handlers. Completion and renaming are exclusive modes of
 * writing, so they share one machine (unlike the simultaneous pointer and choice in `focus`).
 * There is deliberately no `moved` out of `renaming`: with no such transition, no completion can
 * be offered while a name is being retyped.
 *
 * `renaming` carries `base` (the text as armed) and `word`: every keystroke rewrites the whole
 * text from those and the letters typed so far, so no keystroke depends on the previous one and
 * the offsets are read once from a text that does not move.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";
import { ahead } from "../../../shared/lang/complete.js";
import type { Ahead, Vocab } from "../../../shared/lang/complete.js";
import { hits, swap } from "../../../shared/lang/names.js";
import { WORDS } from "../../../shared/lang/rules.js";

/** The state of the text and pointing device at the moment of an event — one shape for all. */
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

/** Three edits the machine asks for; the editor performs them without knowing why. */
export type Says = Merge<
  | IEvent<"armed", { from: number; to: number }>
  | IEvent<"filled", { from: number; to: number; text: string }>
  | IEvent<"rewritten", { text: string; caret: number }>
>;

/** Named by every state that reads the caret — every state but `renaming`. */
const looking = [
  { to: "plain" as const, when: nothing },
  { when: something, to: ["ahead", seen] as const },
];

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
    // TAB changes the text, not the state; the `moved` after the edit reads it again.
    keydown: [
      { when: tabbed, to: "ahead", emit: ["filled", filling] },
      { to: "plain", when: escaped },
    ],
    drop: [{ to: "plain" }],
  },
  picked: {
    // Typing instead of pressing the button drops the word.
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
      // A keystroke anywhere else ends the mode.
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

// ── the operations, declared after the schema that names them ────────────────

// ── what the caret is over ───────────────────────────────────────────────────

/**
 * What would finish the word under the caret, or nothing. Only at the end of a line with no
 * selection: the ghost node mid-line would shift one text layer and not the other, and the caret
 * would drift off its word.
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

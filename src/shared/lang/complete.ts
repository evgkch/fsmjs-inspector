/**
 * What would finish the word being typed, when only one word fits. Where a keyword is expected:
 * the words still to come in the grammar's order. Where a name is expected: the names the text
 * already uses of that kind — offering them is what keeps a misspelt state from becoming a new
 * one. No DOM here; the same answer serves the ghost and the TAB.
 */
import { COMMENT, WORDS } from "./rules.js";
import type { Word } from "./rules.js";
import { KIND } from "./tokens.js";
import type { Ink } from "./tokens.js";

/** The names the text itself has taught, by kind: the states, the events, the outputs. */
export type Vocab = Partial<Record<Ink, readonly string[]>>;

export type Ahead = {
  /** What is already typed, and what a TAB replaces — the case included. */
  typed: string;
  /** The whole word. */
  word: string;
  /** What is missing from it: what the ghost shows. */
  rest: string;
};

/** `head` is the line up to the caret. Nothing is offered unless exactly one word fits. */
export function ahead(head: string, vocab: Vocab): Ahead | null {
  // No words of the language inside a comment.
  if (COMMENT.test(head)) return null;

  const typed = /\S*$/.exec(head)![0];
  if (!typed) return null;

  const said = head
    .slice(0, head.length - typed.length)
    .split(/\s+/)
    .filter(Boolean);
  const before = said[said.length - 1];
  const isWord = (s: string): s is Word =>
    (WORDS as readonly string[]).includes(s);

  const pool: readonly string[] =
    before !== undefined && isWord(before)
      ? // After a keyword comes a name of the kind that keyword takes.
        (vocab[KIND[before]] ?? [])
      : // Otherwise a keyword still to come — a word already used rules out itself and
        // everything before it.
        WORDS.slice(
          Math.max(0, ...said.map((s) => WORDS.indexOf(s as Word) + 1)),
        );

  const low = typed.toLowerCase();
  const fits = pool.filter(
    (w) => w.length > typed.length && w.toLowerCase().startsWith(low),
  );
  if (fits.length !== 1) return null;

  const word = fits[0]!;
  return { typed, word, rest: word.slice(typed.length) };
}

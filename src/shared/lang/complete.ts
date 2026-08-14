/**
 * What the word being typed would be, when only one word could be meant.
 *
 * The language is small and the grammar is an order: a rule runs FROM ON WHEN TO WITH EMIT BY, and
 * after each of those seven words comes a name of a known kind. Both halves of that are worth
 * offering, and they are the same offer:
 *
 *   — where a keyword is expected, the words still to come in the order. On an empty line every
 *     word is possible and `F` can only be FROM; after `FROM locked` the words left are ON and
 *     what follows it, so `O` can only be ON — and `W` is WHEN or WITH, which is two, so nothing
 *     is offered rather than a guess.
 *   — where a name is expected, the names the text has already used of that kind. A schema is a
 *     handful of states written over and over, and a state misspelt once is a new state: the
 *     figure grows a lane nothing reaches, and the reader is left to spot the letter. Offering
 *     what is already written is how a debugger stops that happening at all.
 *
 * Nothing here touches a caret or a DOM node. It reads the line up to where the caret is and says
 * what would finish it — which is also what makes it the same answer for the ghost after the caret
 * and for the word a TAB puts there.
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

/**
 * `head` is the line up to the caret. Nothing is offered unless exactly one word fits: a tool that
 * guesses between two of them is a tool you have to read before you can trust, every time.
 */
export function ahead(head: string, vocab: Vocab): Ahead | null {
  // Past a `#` there are no words of the language, only what you wrote to yourself.
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
      ? // A keyword was just written, so what comes next is a name, and its kind is what that
        // keyword says a value is.
        (vocab[KIND[before]] ?? [])
      : // Otherwise a keyword — and only the ones that may still come. The order is the grammar,
        // so a word already used rules out itself and everything before it.
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

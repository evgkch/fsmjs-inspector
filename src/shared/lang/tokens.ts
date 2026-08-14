/**
 * The rule language, split into words worth colouring — and no further.
 *
 * This does not parse. `rules.ts` decides whether a line is a rule; this only says what each word
 * *is*, and a line it cannot make sense of is left plain rather than marked wrong: the message
 * about that comes from the reader, once, and in words. Keeping the two apart is what lets the
 * editor colour a half-typed line at every keystroke while the machine behind it is rebuilt at
 * most once in a while.
 *
 * Whitespace is a token like any other. The editor draws this underneath a textarea whose own
 * glyphs are transparent, so a character dropped here is a caret that no longer sits on the word
 * it is over.
 */
import { COMMENT, WORDS } from "./rules.js";
import type { Word } from "./rules.js";

/**
 * What a word is. `q` is a state, `s` an event, `l` an output, `op` what can be said about a
 * function — its name, or `?` for one that has none — `key` one of the seven words, `c` a comment,
 * and `""` a word the language has no opinion about.
 */
export type Ink = "key" | "q" | "s" | "l" | "op" | "c" | "";

export type Tok = { text: string; ink: Ink };

/**
 * What the word before it says a value is. Exported because completion asks the same question the
 * colouring does — after `ON` comes the name of an event, and both the ink and the word offered
 * follow from that one fact.
 */
export const KIND: Record<Word, Ink> = {
  FROM: "q",
  TO: "q",
  ON: "s",
  EMIT: "l",
  WHEN: "op",
  WITH: "op",
  BY: "op",
};

/** One line, in the order its characters come. Concatenating the texts gives the line back. */
export function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const put = (text: string, ink: Ink = "") => {
    if (text) out.push({ text, ink });
  };

  // A comment is where the reader stops, so it is where the colour stops: past it there are no
  // words, only what you wrote to yourself.
  const cut = COMMENT.exec(line);
  const head = cut ? line.slice(0, cut.index) : line;

  // Split on whitespace but keep it: what is between the words is as much of the line as the
  // words are, and the caret is counting.
  let word: Word | undefined;
  for (const piece of head.split(/(\s+)/)) {
    if (!piece || /^\s+$/.test(piece)) {
      put(piece);
      continue;
    }
    if ((WORDS as readonly string[]).includes(piece)) {
      put(piece, "key");
      word = piece as Word;
      continue;
    }
    put(piece, word ? KIND[word] : "");
    word = undefined;
  }

  if (cut) put(line.slice(cut.index), "c");
  return out;
}

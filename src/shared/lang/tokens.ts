/**
 * The rule language, split into words worth colouring — no parsing: `rules.ts` decides what is a
 * rule, this only says what each word is, so a half-typed line colours on every keystroke.
 * Whitespace is a token too: the editor draws this under a transparent textarea, and a dropped
 * character would put the caret off its word.
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

/** What the word before a value says it is. Exported: completion asks the same question. */
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

  // The colour stops where the reader stops: at the comment.
  const cut = COMMENT.exec(line);
  const head = cut ? line.slice(0, cut.index) : line;

  // Split on whitespace but keep it — the caret counts every character.
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

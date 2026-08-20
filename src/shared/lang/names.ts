/**
 * A name and everywhere it is written. The text has no declarations, so the name is the
 * identity, and renaming is a whole-text operation — but not a substring replace: `open` is a
 * substring of `opened`, and comments are not words. Words are counted the way the reader
 * counts them.
 */
import { COMMENT } from "./rules.js";

/** Where the word stands as a word of the language, as offsets into the text. */
export function hits(text: string, word: string): number[] {
  const found: number[] = [];
  if (!word) return found;
  let at = 0;
  for (const raw of text.split("\n")) {
    const cut = COMMENT.exec(raw);
    const head = cut ? raw.slice(0, cut.index) : raw;
    for (const m of head.matchAll(/\S+/g))
      if (m[0] === word) found.push(at + m.index);
    at += raw.length + 1;
  }
  return found;
}

/** The same text with every one of them replaced. */
export function swap(text: string, word: string, by: string): string {
  const found = hits(text, word);
  if (!found.length) return text;
  let out = "";
  let read = 0;
  for (const i of found) {
    out += text.slice(read, i) + by;
    read = i + word.length;
  }
  return out + text.slice(read);
}

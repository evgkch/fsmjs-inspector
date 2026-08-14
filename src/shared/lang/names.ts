/**
 * A name of the language, and everywhere it is written.
 *
 * A state is one word appearing in a dozen lines, and there is no other way to say it is the same
 * state: the text has no declarations and no scope, so the name *is* the identity. Which makes
 * renaming one a whole-text operation and a search-and-replace a bad way to do it — `open` is a
 * state, a substring of `opened`, and a word inside a comment nobody meant to touch.
 *
 * So this counts words the way the reader counts them: what is cut off by a `#` is not a word, and
 * a word is what stands between spaces, whole. Replacing every one of them with another name is a
 * schema that says exactly what the old one said.
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

/**
 * The reading, told to the page machine — and the reading is done in `reading.ts` rather than
 * inside the machine's guard, so that the guard stays a question about the outcome rather than a
 * second attempt at it.
 */
import { page } from "./page.js";
import { readSchema } from "./reading.js";

/** Read the text, then tell the page machine the outcome. `keep` is the state to go on running from. */
export function read(text: string, keep: string): void {
  const it = readSchema(text, keep);
  page.dispatch("parsed", {
    graph: it.ok ? it.graph : null,
    rules: it.ok ? it.rules : [],
    message: it.ok ? "" : it.say,
    line: it.ok ? null : it.line,
    keep,
  });
}

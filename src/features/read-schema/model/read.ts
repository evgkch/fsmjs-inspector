/**
 * The editor's text, read as a schema — and the reading is done here rather than inside the
 * machine's guard, so that the guard stays a question about the outcome rather than a second
 * attempt at it.
 *
 * Two forms are accepted and only one of them is the tool's own. The editor speaks the library's
 * language — one sentence per rule, `FROM ON WHEN TO WITH EMIT BY`, the same sentence `toRules`
 * prints and the same one the history writes for every transition. A dump pasted in from
 * `JSON.stringify(machine)` is read too: that is where a schema usually comes from, and refusing
 * it would be a tool being precious.
 */
import type { Graph } from "../../../entities/machine/index.js";
import {
  RuleSyntaxError,
  looksLikeRules,
  parseRules,
} from "../../../shared/lang/rules.js";
import type { Written } from "../../../shared/lang/rules.js";
import { page } from "./page.js";

/** Read the text, then tell the page machine the outcome. `keep` is the state to go on running from. */
export function read(text: string, keep: string): void {
  let graph: Graph | null = null;
  // A dump has no lines to point at: it is not written in the language, and the join between the
  // figure and the text is a line per rule. Read as JSON, the editor is an input box again.
  let rules: readonly Written[] = [];
  let message = "";
  let line: number | null = null;
  try {
    if (looksLikeRules(text)) {
      const reading = parseRules(text);
      graph = reading.graph as Graph;
      rules = reading.rules;
    } else {
      const parsed: unknown = JSON.parse(text);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      )
        throw new Error("a schema is an object keyed by state");
      graph = parsed as Graph;
    }
  } catch (e) {
    message = (e as Error).message;
    // Which line the complaint is about, when the language is the one being complained about. The
    // gutter marks it, and a message naming a line you then have to count to is half a message.
    if (e instanceof RuleSyntaxError) line = e.line;
  }
  page.dispatch("parsed", { graph, rules, message, line, keep });
}

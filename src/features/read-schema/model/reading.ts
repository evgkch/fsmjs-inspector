/**
 * The editor's text, read as a schema — the reading itself, with no machine around it and no
 * widget under it. The inspector's pages run it through the page machine; a page that assembles
 * `<fsmjs-editor>` on its own calls it directly and hands the outcome to `show` or to `blame`.
 *
 * Two forms are accepted and only one of them is the tool's own. The editor speaks the library's
 * language — one sentence per rule, `FROM ON WHEN TO WITH EMIT BY`, the same sentence `toRules`
 * prints and the same one the history writes for every transition. A dump pasted in from
 * `JSON.stringify(machine)` is read too: that is where a schema usually comes from, and refusing
 * it would be a tool being precious.
 */
import { nodes } from "@evgkch/fsmjs";
import type { Graph } from "../../../entities/machine/index.js";
import {
  RuleSyntaxError,
  looksLikeRules,
  parseRules,
} from "../../../shared/lang/rules.js";
import type { Written } from "../../../shared/lang/rules.js";

/** What the figure draws: the graph, its start, and where every rule was written. */
export type Shown = { graph: Graph; start: string; rules: readonly Written[] };

/**
 * What a text turned out to be: a schema, or the reader's complaint. `ok` tells the two apart.
 * `line` is the line the complaint is about, and `null` for a dump — a dump is not written in the
 * language, and the join between the figure and the text is a line per rule.
 */
export type Read =
  ({ ok: true } & Shown) | { ok: false; say: string; line: number | null };

/**
 * Where a run starts: the state asked for while the graph still names it, the first one it names
 * otherwise. A graph that names none starts nowhere, and the name is empty.
 */
export function startOf(graph: Graph, keep: string): string {
  const all = nodes(graph);
  return all.includes(keep) ? keep : (all[0] ?? "");
}

/** A dump is an object keyed by state; an array or a bare value is not one. */
function graphOf(parsed: unknown): Graph {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("a schema is an object keyed by state");
  return parsed as Graph;
}

/**
 * Read the text. `keep` is the state to go on running from, kept while the graph still names it.
 * Nothing is thrown: a text that does not parse comes back as the complaint and its line.
 */
export function readSchema(text: string, keep = ""): Read {
  try {
    const reading = looksLikeRules(text)
      ? parseRules(text)
      : { graph: graphOf(JSON.parse(text)), rules: [] as Written[] };
    return {
      ok: true,
      graph: reading.graph,
      start: startOf(reading.graph, keep),
      rules: reading.rules,
    };
  } catch (e) {
    // Which line the complaint is about, when the language is the one being complained about. The
    // gutter marks it, and a message naming a line you then have to count to is half a message.
    return {
      ok: false,
      say: (e as Error).message,
      line: e instanceof RuleSyntaxError ? e.line : null,
    };
  }
}

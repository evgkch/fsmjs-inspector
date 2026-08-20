/**
 * The parser for the rule language `toRules` writes — one sentence per rule:
 *
 *     FROM locked ON coin WHEN underCap TO locked WITH addCoin
 *     FROM locked ON coin               TO open   WITH reset   EMIT opened
 *     FROM open   ON pass               TO locked
 *
 * `FROM`, `ON` and `TO` are required; `WHEN`, `WITH` and `BY` carry an operation's name, or `?`
 * for a nameless one. Order inside a cell is the order the lines come in — the order the guards
 * are asked in — so a round trip through this and `toRules` is the same schema, not merely an
 * equivalent one. A state with an empty cell (`"done": {}`) writes no line and comes back named
 * by whatever arrives at it; only a state nothing reaches and nothing leaves would be lost.
 *
 * The reader also keeps the line each rule was written on — the join every highlight and gutter
 * mark runs on.
 */
import { nameOf } from "@evgkch/fsmjs";
import type { Edge } from "@evgkch/fsmjs";

/**
 * One rule as a flat row of names — what this tool holds where the library holds an `Edge`.
 *
 * The library types an edge's labels as `PropertyKey`, because a machine's alphabets may be
 * numbers or symbols. Everything this tool reads has been through `JSON.stringify`, over the
 * wire, or out of this parser, and all three write strings. `Row` records that as a type; the
 * conversion happens where a library value comes in, not at every use.
 */
export type Row = {
  readonly from: string;
  readonly on: string;
  readonly to: string;
  readonly emit?: string;
  readonly when?: string;
  readonly with?: string;
  readonly by?: string;
};

/**
 * A library edge, converted. `nameOf` yields what a dump writes for an operation — its name, or
 * `?` for an anonymous function; a `null` hole from a plain `stringify` yields no entry.
 */
export const rowOf = (e: Edge): Row => ({
  from: String(e.from),
  on: String(e.on),
  to: String(e.to),
  ...(e.emit !== undefined && { emit: String(e.emit) }),
  ...(e.when != null && { when: nameOf(e.when, "when") }),
  ...(e.with != null && { with: nameOf(e.with, "with") }),
  ...(e.by != null && { by: nameOf(e.by, "by") }),
});

/** The words, in the order a rule runs. Exported for the highlighter. */
export const WORDS = [
  "FROM",
  "ON",
  "WHEN",
  "TO",
  "WITH",
  "EMIT",
  "BY",
] as const;
export type Word = (typeof WORDS)[number];

/**
 * A comment: `#` or `//` at the start of a line or after a space, to the end of the line.
 * Exported so the highlighter and the reader agree on what is not read.
 */
export const COMMENT = /(^|\s)(#|\/\/).*/;

const SLOT: Record<Word, string> = {
  FROM: "from",
  ON: "on",
  WHEN: "when",
  TO: "to",
  WITH: "with",
  EMIT: "emit",
  BY: "by",
};

export class RuleSyntaxError extends Error {
  readonly line: number;

  constructor(line: number, message: string) {
    super(`line ${line}: ${message}`);
    this.name = "RuleSyntaxError";
    this.line = line;
  }
}

/** Does this text want reading as rules rather than as JSON. */
export const looksLikeRules = (text: string): boolean =>
  !text.trimStart().startsWith("{");

/**
 * Where a rule was read: its line, and its place in its cell — the index the machine's own
 * choice runs on.
 */
export type Written = {
  /** Line, counted from 1, the way the parser's complaints count them. */
  at: number;
  slot: number;
  edge: Row;
};

/** A schema, and the text it was read from, joined line by line. */
export type Reading = {
  graph: Record<string, unknown>;
  rules: Written[];
};

/**
 * One rule as a *schema* holds it: `with` rides in the `to` pair, `by` in the `emit` pair — the
 * library reads `to` and `emit` and nothing else, so a flat `with` field would silently vanish
 * from every downstream reader.
 */
type Held = {
  to: string | [string, string];
  emit?: string | [string, string];
  when?: string;
};

/** A label and the operation named beside it, or the label alone where none was. */
const bound = (label: string, op: string | undefined): Held["to"] =>
  op === undefined ? label : [label, op];

/** One schema from one sentence per rule. Throws `RuleSyntaxError` at the first bad line. */
export function parseRules(text: string): Reading {
  const graph: Record<string, Record<string, Held[]>> = {};
  const rules: Written[] = [];

  text.split("\n").forEach((raw, i) => {
    const at = i + 1;
    const line = raw.replace(COMMENT, "").trim();
    if (!line) return;

    const words = line.split(/\s+/);
    const rule: Record<string, string> = {};
    let next = 0; // how far down WORDS we have got: the order is the grammar

    for (let w = 0; w < words.length;) {
      const token = words[w]!;
      const found = WORDS.indexOf(token as Word);
      if (found < 0)
        throw new RuleSyntaxError(
          at,
          `expected one of ${WORDS.join(" ")}, found “${token}”`,
        );
      if (found < next)
        throw new RuleSyntaxError(
          at,
          `${token} comes after ${WORDS[found + 1]!} here; the words run ${WORDS.join(" ")}`,
        );
      const value = words[w + 1];
      if (value === undefined || WORDS.includes(value as Word))
        throw new RuleSyntaxError(at, `${token} says nothing`);
      rule[SLOT[token as Word]] = value;
      next = found + 1;
      w += 2;
    }

    for (const need of ["from", "on", "to"] as const)
      if (rule[need] === undefined)
        throw new RuleSyntaxError(at, `no ${need.toUpperCase()}`);

    const { from, on } = rule;
    const cells = (graph[from!] ??= {});
    const cell = (cells[on!] ??= []);
    // The row stays flat — a `Row` is one column per fact, and that is what every reader below
    // this line already asks for. Only the schema binds the operations to their labels.
    rules.push({ at, slot: cell.length, edge: { ...rule, from, on } as Row });
    cell.push({
      to: bound(rule["to"]!, rule["with"]),
      ...(rule["emit"] !== undefined && {
        emit: bound(rule["emit"], rule["by"]),
      }),
      ...(rule["when"] !== undefined && { when: rule["when"] }),
    });
  });

  return { graph, rules };
}

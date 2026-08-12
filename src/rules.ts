/**
 * The rule language, read back.
 *
 * `toRules` writes a schema as one sentence per rule — `FROM ON WHEN TO WITH EMIT BY`, in the
 * order the rule runs — and the library says of it that the grammar is regular and
 * whitespace-insensitive, but ships no parser. A tool whose subject is a machine should let you
 * write in the language the machine is written in, so here is the parser.
 *
 *     FROM locked ON coin WHEN underCap TO locked WITH addCoin
 *     FROM locked ON coin               TO open   WITH reset   EMIT opened
 *     FROM open   ON pass               TO locked
 *
 * `FROM`, `ON` and `TO` are the graph and are required. `WHEN`, `WITH` and `BY` carry what can be
 * said about a function — its name, or `?` for one that has none — and a schema read from either
 * form keeps them as names, because that is all a dump ever had. Order inside a cell is the order
 * the lines come in, which is the order the guards are asked in, so a round trip through this and
 * `toRules` is the same schema and not merely an equivalent one.
 *
 * One thing the language cannot say, and it is the right thing not to say: a state with an empty
 * cell of its own — `"done": {}` in JSON — writes no line, because there is no rule to write. It
 * comes back all the same, named by whatever arrives at it, which is how a state with nothing
 * leaving it is named anywhere else. Only a state that nothing reaches *and* nothing leaves would
 * be lost, and a schema is not saying anything by carrying one.
 */

/** The words, in the order a rule runs. `toRules` writes them in exactly this order. */
const WORDS = ["FROM", "ON", "WHEN", "TO", "WITH", "EMIT", "BY"] as const;
type Word = (typeof WORDS)[number];

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
 * One schema, from one sentence per rule. Throws `RuleSyntaxError` on the first line that is not
 * one — a tool that quietly drops a line you typed is worse than one that will not read it.
 */
export function parseRules(text: string): Record<string, unknown> {
  const graph: Record<string, Record<string, Record<string, string>[]>> = {};

  text.split("\n").forEach((raw, i) => {
    const at = i + 1;
    const line = raw.replace(/(^|\s)(#|\/\/).*$/, "").trim();
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

    const { from, on, ...rest } = rule;
    const cells = (graph[from!] ??= {});
    (cells[on!] ??= []).push(rest);
  });

  return graph;
}

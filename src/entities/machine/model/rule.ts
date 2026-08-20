/**
 * The one spelling of "that rule": its cell (from, on) and its place in it. The parser, the text
 * subject's guards and the figure all name rules through this.
 */

/** A rule, as everything that has to name one names it. */
export type RuleId = string;

export const ruleId = (from: string, on: string, at: number): RuleId =>
  `${from}\0${on}\0${at}`;

/** The three parts back. `at` is the place in the cell, which is what the guards count. */
export const partsOf = (
  id: RuleId,
): { from: string; on: string; at: number } => {
  const [from = "", on = "", at = "0"] = id.split("\0");
  return { from, on, at: Number(at) };
};

/**
 * The id of a rule, given the flat list it came from. `edges` flattens a cell in the order the
 * schema wrote it, so a rule's index within its cell is its place in it.
 */
export const idOf = (
  all: readonly { from: string; on: string }[],
  r: { from: string; on: string },
): RuleId => {
  const cell = all.filter((e) => e.from === r.from && e.on === r.on);
  return ruleId(r.from, r.on, Math.max(0, cell.indexOf(r as never)));
};

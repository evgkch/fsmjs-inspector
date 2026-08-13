/**
 * Which rule, of all the rules in a schema — written once, here.
 *
 * A rule has no name of its own. What it has is a cell and a place in that cell: the pair
 * `dispatch` is addressed by, and how far down the alternatives the guards would have got. Three
 * different parts of the tool need to say *that rule* — the parser, which knows what line it read
 * it on; the guard the text subject puts back, which has to recognise the one that was named; and
 * the figure, which has an `Edge` and needs to ask whether it fires. They agreed on a spelling by
 * writing it out three times, which is the same as not agreeing.
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

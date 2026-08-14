/**
 * What is wrong with a schema, and what is merely true about it.
 *
 * `analyze` and `validate` answer this, and the answers used to be shown as a list of four rows
 * beside the text — states, reachable, unreachable, terminal. Three of those four are a defect or a
 * fact *about a name*, and the fourth, the list of every state, is the text itself written out a
 * second time. A list of names beside a text full of those names is a lookup table for a thing you
 * are already looking at.
 *
 * So it is computed here, once, and drawn where the names are: the word is struck through in the
 * source and in the figure, the line is marked in the gutter, and nothing is listed anywhere. The
 * figure and the editor ask the same questions of the same object, which is why they cannot
 * disagree about which state is stranded.
 */
import { edges } from "@evgkch/fsmjs";
import { analyze, validate } from "@evgkch/fsmjs/analysis";
import type { Graph } from "./graph.js";
import { partsOf } from "./rule.js";
import type { RuleId } from "./rule.js";

export type Flaws = {
  /** Every state the schema names. */
  all: readonly string[];
  /** How many rules it is written in. */
  rules: number;
  /** States no run can reach from the start: whatever is written of them is dead text. */
  off: Set<string>;
  /** States nothing leaves. Not a fault — a run that arrives there stops, and that may be why. */
  ends: Set<string>;
  /**
   * A rule an unguarded one ahead of it in the same cell would always beat — `validate`'s
   * `dead-rule`, read as the dump would be. The cell decides, and the order inside it says which.
   */
  shadowed: (id: RuleId) => boolean;
  /** It can never fire: either nothing reaches where it starts, or something shadows it. */
  dead: (id: RuleId) => boolean;
};

export function flaws(graph: Graph, start: string): Flaws {
  const facts = analyze(graph, start);
  const off = new Set<string>(facts.unreachable);
  const flagged = new Set(
    validate(graph, start)
      .filter((i) => i.kind === "dead-rule")
      .map((i) => `${i.node}\0${i.event}`),
  );

  // The first rule of a cell is the one that wins, so the ones behind it are the ones flagged.
  // Which is `at`, and `at` is part of a rule's name here — no object identity is needed, and none
  // would work: the parser's rules and `edges`' rules are different objects saying the same thing.
  const shadowed = (id: RuleId): boolean => {
    const { from, on, at } = partsOf(id);
    return at > 0 && flagged.has(`${from}\0${on}`);
  };

  return {
    all: facts.nodes,
    rules: edges(graph).length,
    off,
    ends: new Set<string>(facts.terminal),
    shadowed,
    dead: (id) => off.has(partsOf(id).from) || shadowed(id),
  };
}

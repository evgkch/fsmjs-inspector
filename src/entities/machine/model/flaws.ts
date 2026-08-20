/**
 * What `analyze` and `validate` make of a schema, computed once and drawn on the names it is
 * about — struck through in the source and the figure, marked in the gutter, listed nowhere.
 * One object, so the two surfaces cannot disagree.
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
      .map((i) => `${i.node}\0${String(i.event)}`),
  );

  // Matched by cell and position (`at`), not object identity: the parser's rules and `edges`'
  // rules are different objects.
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

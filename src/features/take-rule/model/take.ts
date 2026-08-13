/**
 * Firing a rule — the one thing this tool does that changes something.
 *
 * There are two ways to ask for it and they must be the same ask. From the figure: name a cause,
 * name an effect, and the rule they cross at is the one meant. From the text: point at the line a
 * rule is written on, which names it outright. Neither is a different kind of event — a rule is
 * fired, or it is not — so both come down to an id here, and the machine is moved in one place.
 *
 * What a rule *is* when it comes from the figure is worth saying: two cells, and the rules they
 * both hold. That set may have more than one rule in it and often does, since a cause cell is
 * itself a set — the alternatives its guards decide between. The first that can fire is the one
 * fired, which is exactly what the machine would have done with the event on its own.
 */
import type { Edge } from "@evgkch/fsmjs";
import { holds } from "../../../entities/cell/index.js";
import type { Key } from "../../../entities/cell/index.js";
import { idOf, partsOf } from "../../../entities/machine/index.js";
import type { RuleId, Subject } from "../../../entities/machine/index.js";

/**
 * Could the machine take this rule from where it stands. On a dump that is a question about the
 * cell; on a machine that is running it is a question its own guards answer.
 */
export const canFire = (subject: Subject, id: RuleId): boolean =>
  partsOf(id).from === subject.at && (subject.drive?.can(id) ?? false);

/** Take it. What actually happens is the machine's business, and shows up in its steps. */
export const take = (subject: Subject, id: RuleId): void => {
  subject.drive?.take(id);
};

/**
 * The rule two named halves come down to, if the machine can take it. Nothing to take is a
 * perfectly ordinary answer: exploring, no state is current and nothing fires at all.
 */
export const between = (
  subject: Subject,
  rows: readonly Edge[],
  keys: readonly Key[],
): RuleId | undefined => {
  for (const r of rows) {
    if (!keys.every((k) => holds(k, r))) continue;
    const id = idOf(rows, r);
    if (canFire(subject, id)) return id;
  }
  return undefined;
};

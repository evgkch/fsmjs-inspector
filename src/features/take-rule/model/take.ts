/**
 * Firing a rule. The figure names it by two cells, the text by its line; both come down to an id
 * here, and the machine is moved in one place. Two cells may hold several rules — the first that
 * can fire is fired, exactly as the machine would decide on its own.
 */
import { holds } from "../../../entities/cell/index.js";
import type { Key } from "../../../entities/cell/index.js";
import { idOf, partsOf } from "../../../entities/machine/index.js";
import type { RuleId, Subject } from "../../../entities/machine/index.js";
import type { Row } from "../../../shared/lang/rules.js";

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
 * perfectly ordinary answer — a watched machine is not driven from here at all.
 */
export const between = (
  subject: Subject,
  rows: readonly Row[],
  keys: readonly Key[],
): RuleId | undefined => {
  for (const r of rows) {
    if (!keys.every((k) => holds(k, r))) continue;
    const id = idOf(rows, r);
    if (canFire(subject, id)) return id;
  }
  return undefined;
};

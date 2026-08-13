/**
 * A cell of the figure, and what it says about a rule.
 *
 * The figure draws δ×λ as three blocks. 1 is FROM × ON and 3 is TO × EMIT — the two halves of a
 * transition, and the library already names them: a `Transition` carries `source` and `input`
 * going in and `target` and `output` coming out, so one half is the **cause** and the other the
 * **effect**. 2 is FROM × TO, where the row out of a cause meets the column into an effect: not
 * a half of anything, but the **crossing** the two are connected through.
 *
 * A cell is a key rather than the rules in it, because every redraw builds fresh rows and holding
 * the rows themselves would go stale. What a key is comes first:
 *
 *   `cause\0from\0on`    block 1 — a transition's source and input, the pair `dispatch` takes
 *   `effect\0emit\0to`   block 3 — its output and target, an empty emit being no output at all
 *   `corner\0from\0to`   block 2 — the crossing, which is shown and pointed at, never held
 *
 * And `holds` is the whole of what a key means: a cell is a subset of the rules, so read in the
 * block where the inputs live that subset is the preimage of a choice, and in the block where the
 * outputs live it is the image — the same set, projected the two ways. That is why narrowing needs
 * no code of its own, why pointing at any one of the three blocks says something about the other
 * two, and why the editor can light a line without knowing the figure exists.
 */
import type { Edge } from "@evgkch/fsmjs";

/** The two halves of a transition, and the crossing they meet at. */
export const CAUSE = "cause";
export const CORNER = "corner";
export const EFFECT = "effect";

export type Kind = typeof CAUSE | typeof CORNER | typeof EFFECT;

export type Key = `${Kind}\0${string}\0${string}`;

export const keyOf = (kind: Kind, a: string, b: string): Key =>
  `${kind}\0${a}\0${b}`;

export const kindOf = (key: Key): Kind => key.split("\0")[0] as Kind;

/** The other half of a transition. A crossing is not a half and has no other. */
export const MIRROR: Partial<Record<Kind, Kind>> = {
  [CAUSE]: EFFECT,
  [EFFECT]: CAUSE,
};

export const HALVES: Kind[] = [CAUSE, EFFECT];

/** Does this cell hold that rule. */
export function holds(key: Key, r: Edge): boolean {
  const [kind, a, b] = key.split("\0");
  switch (kind) {
    case CAUSE:
      return r.from === a && r.on === b;
    case CORNER:
      return r.from === a && r.to === b;
    case EFFECT:
      // `a` is empty for the outcome "arrives at b and emits nothing". That outcome has no cell
      // in block 3 — there is no output to give it one — so it is named on the `to` axis itself.
      return (r.emit ?? "") === a && r.to === b;
    default:
      return false;
  }
}

/**
 * The two cells a rule is written in — its cause and its effect, which is the whole of what the
 * figure has to say about one rule. Naming a rule from outside the figure means naming both: a
 * line of text is not half a transition, and lighting only the half it starts at would say the
 * figure has nothing to show about where it ends up.
 *
 * A rule that emits nothing still has an effect cell. It is the name of its column — there is no
 * output to give it a square, and that name is where `TO r` is written and has been all along.
 */
export const causeOf = (r: { from: string; on: string }): Key =>
  keyOf(CAUSE, r.from, r.on);

export const effectOf = (r: { to: string; emit?: string }): Key =>
  keyOf(EFFECT, r.emit ?? "", r.to);

export const halvesOf = (r: Edge): Key[] => [causeOf(r), effectOf(r)];

/**
 * Is the figure about this rule right now — asked of the cells `look` says are shown.
 *
 * The figure asks it of every rule it drew and the editor asks it of every line it read, and they
 * must not answer differently: a cell lighting up while the line naming its rule stays dark is two
 * readings of one word. So there is one predicate, and neither of them has a copy.
 */
export const shows = (shown: readonly Key[], r: Edge): boolean =>
  shown.length > 0 && shown.every((k) => holds(k, r));

/**
 * A cell of the figure, as a key. Block 1 is the **cause** (FROM × ON), block 3 the **effect**
 * (TO × EMIT), block 2 the **crossing** (FROM × TO) — shown and pointed at, never held.
 *
 *   `cause\0from\0on`  ·  `effect\0emit\0to` (empty emit = no output)  ·  `corner\0from\0to`
 *
 * A cell is a key rather than the rules in it, because every redraw builds fresh rows. `holds`
 * is the whole of what a key means — one predicate, which is why the editor can light a line
 * without knowing the figure exists.
 */
import type { Row } from "../../../shared/lang/rules.js";

/** The two halves of a transition, and the crossing they meet at. */
export const CAUSE = "cause";
export const CORNER = "corner";
export const EFFECT = "effect";

/** A state as a source: every rule leaving it. Held, it completes no pair. */
export const SOURCE = "source";

export type Kind = typeof CAUSE | typeof CORNER | typeof EFFECT | typeof SOURCE;

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
export function holds(key: Key, r: Row): boolean {
  const [kind, a, b] = key.split("\0");
  switch (kind) {
    case CAUSE:
      return r.from === a && r.on === b;
    case CORNER:
      return r.from === a && r.to === b;
    case SOURCE:
      return r.from === a;
    case EFFECT:
      // `a` is empty for the outcome "arrives at b and emits nothing". That outcome has no cell
      // in block 3 — there is no output to give it one — so it is named on the `to` axis itself.
      return (r.emit ?? "") === a && r.to === b;
    default:
      return false;
  }
}

/**
 * The two cells a rule is written in — its cause and its effect; naming a rule from outside the
 * figure names both. A rule that emits nothing still has an effect cell: the name of its column.
 */
export const causeOf = (r: { from: string; on: string }): Key =>
  keyOf(CAUSE, r.from, r.on);

export const effectOf = (r: { to: string; emit?: string }): Key =>
  keyOf(EFFECT, r.emit ?? "", r.to);

export const halvesOf = (r: Row): Key[] => [causeOf(r), effectOf(r)];

/**
 * Is the figure about this rule right now — one predicate, asked by the figure of its rules and
 * by the editor of its lines, so the two cannot answer differently.
 */
export const shows = (shown: readonly Key[], r: Row): boolean =>
  shown.length > 0 && shown.every((k) => holds(k, r));

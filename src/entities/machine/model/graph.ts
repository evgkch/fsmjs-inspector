/**
 * What is left of a machine after `JSON.stringify` — and it is the whole of what this tool reads.
 *
 * A dump keeps the labels and writes the *name* of every operation in place of its code. That is
 * enough to draw the machine, enough to check it, and — with no operations in it at all — enough
 * to still run it. Everything below is that fact spelled out in types.
 */
import type { Transition } from "@evgkch/fsmjs";

/** A schema read back from JSON: labels, and the name of every operation that was there. */
export type Graph = Record<string, unknown>;

/**
 * What JSON leaves of the three carriers: no state carries a context, no event carries a
 * payload. That is not a simplification made for the inspector. It is what a dumped schema is,
 * and it is the reason a machine can be built from one at all.
 */
export type Ctx = Record<string, undefined>;
export type Ev = Record<string, void>;

/** One transition, in the only shape the figure reads it in. */
export type Step = Transition<Ctx, Ev, Ev>;

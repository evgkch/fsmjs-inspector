/**
 * What is left of a machine after `JSON.stringify` — the whole of what this tool reads: labels,
 * and the name of every operation. Enough to draw, to check, and to run.
 */
import type { Transition } from "@evgkch/fsmjs";

/** A schema read back from JSON: labels, and the name of every operation that was there. */
export type Graph = Record<string, unknown>;

/** What JSON leaves of the carriers: no state carries a context, no event a payload. */
export type Ctx = Record<string, undefined>;
export type Ev = Record<string, void>;

/** One transition, in the only shape the figure reads it in. */
export type Step = Transition<Ctx, Ev, Ev>;

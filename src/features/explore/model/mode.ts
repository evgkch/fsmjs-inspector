/**
 * How the whole thing is being read: a machine that is running, or a schema on the table.
 *
 *   running ──read(whole)──▸ exploring ──read(part)──▸ running
 *
 * Two states and two rules, and no rule for being told what is already true — so the machine moves
 * only when the mode actually changes, and everything that redraws on a change redraws exactly as
 * often as there are changes.
 *
 * It is small, and it is a machine for the same reason the others are: it is the one fact on this
 * page that is remembered rather than derived. Where the run stands belongs to the subject, what
 * is being pointed at belongs to `focus`, and the figure and the run themselves remember nothing
 * at all — they are drawings of those. This is the exception, and as a boolean it was the exception
 * three times over: a field in the history, an argument threaded through the figure, and a checkbox
 * that all three had to agree with.
 *
 * The two modes differ in one thing said two ways. Exploring, no state is current: the question is
 * what the schema allows, not what this machine can do next, so nothing fires, nothing is marked,
 * and there is no run to show. Running, the machine stands somewhere, and everything out of its
 * reach is dim. Neither is a property of the figure — the figure asks it, in `plan`, and draws.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

export type Read = Merge<IState<"running"> | IState<"exploring">>;

/** Read the whole schema, or read where the machine stands. */
export type Asked = Merge<IEvent<"read", { whole: boolean }>>;

const reading: Schema<Read, Asked, Record<string, never>> = {
  running: { read: [{ to: "exploring", when: whole }] },
  exploring: { read: [{ to: "running", when: part }] },
};

export type Mode = StateMachine<Read, Asked, Record<string, never>>;

export function newMode(): Mode {
  return new StateMachine<Read, Asked, Record<string, never>>(reading, {
    type: "running",
    context: undefined,
  });
}

/** What every drawing asks of it, so that none of them spells the comparison out. */
export function exploring(mode: Mode): boolean {
  return mode.state.type === "exploring";
}

// ── the guards ───────────────────────────────────────────────────────────────
//
// Below the schema, and declarations rather than expressions, because that is the order the thing
// was designed in: the states and the rules first, and then whatever the rules turned out to need.
// A file that reads the other way round asks its reader to hold a dozen small functions in mind
// before showing them what they are for.

function whole(_: unknown, p: { whole: boolean }): boolean {
  return p.whole;
}

function part(_: unknown, p: { whole: boolean }): boolean {
  return !p.whole;
}

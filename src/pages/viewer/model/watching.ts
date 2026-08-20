/**
 * Which machine this page is drawing.
 *
 *   nobody   ──pick(who)──▸ watching {who}
 *   watching ──pick(who)──▸ watching {who}
 *   watching ──gone(who)──▸ nobody      when it is the one being watched
 *
 * `gone` is guarded here, not checked by the caller: another machine leaving is no reason to
 * look away from this one.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

export type Look = Merge<
  IState<"nobody"> | IState<"watching", { who: string }>
>;

export type Told = Merge<
  IEvent<"pick", { who: string }> | IEvent<"gone", { who: string }>
>;

const looking: Schema<Look, Told, Record<string, never>> = {
  nobody: { pick: [{ to: ["watching", at] }] },
  watching: {
    pick: [{ to: ["watching", at] }],
    gone: [{ to: "nobody", when: mine }],
  },
};

export type Watching = StateMachine<Look, Told, Record<string, never>>;

export function newWatching(): Watching {
  return new StateMachine<Look, Told, Record<string, never>>(looking, {
    type: "nobody",
    context: undefined,
  });
}

/** Who is being watched, or nobody — the whole of what the page asks of it. */
export function watched(it: Watching): string | null {
  return it.state.type === "watching" ? it.state.context.who : null;
}

// ── the guards ───────────────────────────────────────────────────────────────

function at(_: unknown, p: { who: string }): { who: string } {
  return { who: p.who };
}

function mine(c: { who: string }, p: { who: string }): boolean {
  return c.who === p.who;
}

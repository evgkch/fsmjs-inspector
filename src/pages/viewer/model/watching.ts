/**
 * Which machine out there this page is drawing.
 *
 * One fact, remembered rather than derived — the roster says who is out there and cannot say which
 * of them you are looking at — so it is a machine, like every other remembered thing here.
 *
 *   nobody   ──pick(who)──▸ watching {who}
 *   watching ──pick(who)──▸ watching {who}
 *   watching ──gone(who)──▸ nobody      when it is the one being watched
 *
 * `gone` is guarded rather than checked by the caller: machines come and go while you are reading
 * one of them, and an application restarting its worker is not a reason to look away from its
 * checkout. The page says what happened; what follows is here.
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
  nobody: { pick: [{ to: "watching", with: at }] },
  watching: {
    pick: [{ to: "watching", with: at }],
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

/**
 * Whether the pipe is up.
 *
 *   dialling ──up──▸ live ──down──▸ dialling
 *
 * Two states, two rules, and no rule for being told what is already true — so a socket that closes
 * twice, or answers twice, moves nothing and redraws nothing.
 *
 * It is a machine for the reason everything remembered here is one. The alternative was asking
 * `sock?.readyState === 1` at the moment somebody wanted to know, and that is not the same
 * question: `readyState` is about the socket that exists right now, and a page waiting for a
 * connection is asking about the wire, which outlives any one socket and is down in the second
 * between a close and the next dial.
 */
import { StateMachine } from "@evgkch/fsmjs";
import type { IEvent, IState, Merge, Schema } from "@evgkch/fsmjs";

export type Wire = Merge<IState<"dialling"> | IState<"live">>;

export type Rang = Merge<IEvent<"up"> | IEvent<"down">>;

const ringing: Schema<Wire, Rang, Record<string, never>> = {
  dialling: { up: [{ to: "live" }] },
  live: { down: [{ to: "dialling" }] },
};

export type Dialling = StateMachine<Wire, Rang, Record<string, never>>;

export function newDialling(): Dialling {
  return new StateMachine<Wire, Rang, Record<string, never>>(ringing, {
    type: "dialling",
    context: undefined,
  });
}

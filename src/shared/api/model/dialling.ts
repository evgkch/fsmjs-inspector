/**
 * Whether the pipe is up: dialling ──up──▸ live ──down──▸ dialling. No rule for being told what
 * is already true, so a socket that closes twice moves nothing. Kept apart from `readyState`,
 * which is about the current socket — the wire outlives any one of them.
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

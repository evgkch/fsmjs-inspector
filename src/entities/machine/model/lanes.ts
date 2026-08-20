/**
 * One colour per state, the same wherever the state is written — figure, editor, history. One
 * order and one function, so the surfaces cannot drift apart. The order is breadth-first from
 * the start (`analyze`'s `reachable`), unreachable states last.
 */
import { analyze } from "@evgkch/fsmjs/analysis";
import type { Graph } from "./graph.js";

/** The palette repeats after this many states. */
export const LANES = 8;

export function lanes(graph: Graph, start: string): string[] {
  const facts = analyze(graph, start);
  return [...facts.reachable, ...facts.unreachable];
}

/** The custom property that carries a state's colour, for the `style` attribute. */
export const hue = (i: number): string => `--c: var(--lane-${i % LANES})`;

/**
 * A state's colour for a word, or `undefined` for a name this graph does not have — no fallback
 * to lane 0, which belongs to the start state.
 */
export type Lane = (state: string) => string | undefined;

export function palette(graph: Graph, start: string): Lane {
  const lane = new Map(lanes(graph, start).map((n, i) => [n, i]));
  return (state) => {
    const i = lane.get(state);
    return i === undefined ? undefined : hue(i);
  };
}

/**
 * The machine, as everything above this layer knows it: a graph, the rules in it, one colour per
 * state, and the seam a figure is drawn against.
 */
export type { Ctx, Ev, Graph, Step } from "./model/graph.js";
export { idOf, partsOf, ruleId } from "./model/rule.js";
export { flaws } from "./model/flaws.js";
export { folds } from "./model/folds.js";
export type { Fold } from "./model/folds.js";
export type { Flaws } from "./model/flaws.js";
export type { RuleId } from "./model/rule.js";
export { LANES, hue, lanes, palette } from "./model/lanes.js";
export type { Lane } from "./model/lanes.js";
export type { Change, Drive, Subject } from "./model/subject.js";
export { fromText } from "./lib/from-text.js";
export type { Text, Told } from "./lib/from-text.js";
export { fromMachine } from "./lib/from-machine.js";
export type { Options as WatchOptions } from "./lib/from-machine.js";
export { fromWire } from "./lib/from-wire.js";
export type { Presence, Watched } from "./lib/from-wire.js";
export type { Wire } from "./model/wire.js";

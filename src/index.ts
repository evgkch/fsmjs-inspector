/**
 * @evgkch/fsmjs-inspector — look at a state machine.
 *
 * Two ways in, one figure. `mount` puts the inspector in an element you give it and points it at
 * a subject; `inspect` does the same over your own page, on a machine that is running. What a
 * subject is, and the one place the two differ, is in `subject.ts`.
 */
// The tool carries its own look. A bundler that pulls this in gets the stylesheet with it, so
// an application does not have to know where the inspector keeps its CSS.
import "./style.css";

export { mount } from "./inspector.js";
export type { Handle, Options as ViewOptions } from "./inspector.js";

export { inspect } from "./overlay.js";
export type { Inspection, Options as InspectOptions } from "./overlay.js";

export { fromText } from "./subjects/text.js";
export type { Text } from "./subjects/text.js";

export { fromMachine } from "./subjects/machine.js";

export { idOf } from "./subject.js";
export type {
  Ctx,
  Drive,
  Ev,
  Graph,
  RuleId,
  Step,
  Subject,
} from "./subject.js";

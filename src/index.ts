/**
 * @evgkch/fsmjs-inspector — look at a state machine.
 *
 * Two ways in, one figure. `mount` puts the inspector in an element you give it and points it at
 * a subject; `inspect` does the same over your own page, on a machine that is running. What a
 * subject is, and the one place the two differ, is in `entities/machine`.
 */
// The tool carries its own look. A bundler that pulls this in gets the stylesheet with it, so
// an application does not have to know where the inspector keeps its CSS.
import "./shared/ui/tokens.css";

export { mount } from "./pages/inspector/mount.js";
export type {
  Handle,
  Options as ViewOptions,
} from "./pages/inspector/mount.js";

export { inspect } from "./app/inspect.js";
export type { Inspection, Options as InspectOptions } from "./app/inspect.js";

export { newFocus } from "./features/focus/index.js";
export type { Focus } from "./features/focus/index.js";

export {
  fromMachine,
  fromText,
  idOf,
  partsOf,
  ruleId,
} from "./entities/machine/index.js";
export type {
  Ctx,
  Drive,
  Ev,
  Graph,
  RuleId,
  Step,
  Subject,
  Text,
} from "./entities/machine/index.js";

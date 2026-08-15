/**
 * @evgkch/fsmjs-inspector/ui — the tool itself, for a page that wants to draw it.
 *
 * This is not what an application writes. An application writes `inspect(fsm)`, which is one line,
 * costs it no stylesheet and no document, and is the package's main entry. This is the other half:
 * `mount` puts the figure in an element you give it, `overlay` floats it over your own page, and
 * the rest is what a page needs to point them at something.
 *
 * Everything here draws. Importing it means importing a stylesheet.
 */
import "./shared/ui/tokens.css";

export { mount } from "./pages/inspector/mount.js";
export type {
  Handle,
  Options as ViewOptions,
} from "./pages/inspector/mount.js";

export { overlay } from "./app/overlay.js";
export type { Overlaid, Options as OverlayOptions } from "./app/overlay.js";

/**
 * The widgets, as elements. Importing any of them registers it, and importing this module
 * registers all three — so a page can drop one in and wire it to a subject, a focus and a mode
 * without lifting the whole inspector. Each is the panel itself: `<fsmjs-figure>` *is* the `.out`
 * box, `<fsmjs-history>` the `.history`, `<fsmjs-editor>` the `.editor`, and each takes a `wiring`
 * property (a JS object, never an attribute).
 */
export { FsmjsFigure } from "./widgets/figure/figure.js";
export type { Wiring as FigureWiring } from "./widgets/figure/figure.js";
export { FsmjsHistory } from "./widgets/history/history.js";
export type { Wiring as HistoryWiring } from "./widgets/history/history.js";
export { FsmjsEditor } from "./widgets/editor/editor.js";
export type { Wiring as EditorWiring } from "./widgets/editor/editor.js";

export { newFocus } from "./features/focus/index.js";
export type { Focus } from "./features/focus/index.js";

export { newMode } from "./features/explore/index.js";
export type { Mode } from "./features/explore/index.js";

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

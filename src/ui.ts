/**
 * @evgkch/fsmjs-inspector/ui — the drawing half. An application writes `inspect(fsm)` (the main
 * entry); a page that wants the tool on it uses `mount`, `overlay`, or the widgets below.
 * Importing this module imports a stylesheet.
 */
import "./shared/ui/tokens/tokens.css";

export { mount } from "./pages/inspector/mount.js";
export type {
  Handle,
  Options as ViewOptions,
  Surface,
} from "./pages/inspector/mount.js";

export { ensemble } from "./pages/inspector/ensemble.js";
export type { Cast, Ensemble, Member } from "./pages/inspector/ensemble.js";

export { overlay } from "./app/overlay.js";
export type { Overlaid, Options as OverlayOptions } from "./app/overlay.js";

/**
 * The widgets, as custom elements; importing registers them. Each takes a `wiring` property (a
 * JS object, never an attribute) and draws into a shadow root with its own stylesheet. The
 * palette crosses in through inherited custom properties, so `tokens.css` is required;
 * `style.css` covers the light DOM only — the mount's grid and the overlay.
 */
export { FsmjsFigure } from "./widgets/figure/figure.js";
export type { Wiring as FigureWiring } from "./widgets/figure/figure.js";
export { FsmjsHistory } from "./widgets/history/history.js";
export type { Wiring as HistoryWiring } from "./widgets/history/history.js";
export { FsmjsEditor } from "./widgets/editor/editor.js";
export type { Wiring as EditorWiring } from "./widgets/editor/editor.js";
export { FsmjsDiagram } from "./widgets/diagram/diagram.js";
export type { Wiring as DiagramWiring } from "./widgets/diagram/diagram.js";
export { FsmjsLegend } from "./widgets/legend/legend.js";
export type {
  Kind as LegendKind,
  Wiring as LegendWiring,
} from "./widgets/legend/legend.js";
export { FsmjsDesk } from "./widgets/desk/desk.js";
export type { Wiring as DeskWiring } from "./widgets/desk/desk.js";

export { report } from "./features/report/index.js";

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

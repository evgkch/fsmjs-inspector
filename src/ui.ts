/**
 * @evgkch/fsmjs-inspector/ui — the drawing half. An application writes `inspect(fsm)` (the main
 * entry); a page that wants the tool on it uses `mount`, `overlay`, or the widgets below.
 * Importing this module imports a stylesheet.
 */
import "./shared/ui/tokens/tokens.css";

export { mount } from "./widgets/inspector/mount.js";
export type {
  Handle,
  Options as ViewOptions,
  Surface,
} from "./widgets/inspector/mount.js";

export { ensemble } from "./widgets/inspector/ensemble.js";
export type { Cast, Ensemble, Member } from "./widgets/inspector/ensemble.js";

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

/**
 * Rule text, read as a schema — everything `<fsmjs-editor>`'s `show` and `blame` are given. A page
 * that assembles the editor itself calls `readSchema` on every edit and keeps what it wants of the
 * outcome. Taken from the module rather than from the feature's index, which also publishes the
 * inspector's page machine: the reading holds no state, and neither does a page that borrows it.
 */
export { readSchema, startOf } from "./features/read-schema/model/reading.js";
export type { Read, Shown } from "./features/read-schema/model/reading.js";
export type { Row, Written } from "./shared/lang/rules.js";

export { newFocus } from "./features/focus/index.js";
export type { Focus } from "./features/focus/index.js";

export {
  flaws,
  fromMachine,
  fromText,
  idOf,
  palette,
  partsOf,
  ruleId,
} from "./entities/machine/index.js";
export type {
  Ctx,
  Drive,
  Ev,
  Flaws,
  Graph,
  Lane,
  RuleId,
  Step,
  Subject,
  Text,
} from "./entities/machine/index.js";

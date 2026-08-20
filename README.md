**English** · [Русский](README.ru.md)

# fsmjs inspector

A finite-state-machine inspector for [`@evgkch/fsmjs`](https://github.com/evgkch/fsmjs). It reads a dumped schema or attaches to a running machine and shows three projections of one automaton: the rule text, the transition figure, and the run. The projections are linked: point at a cell of the figure and the rule's line lights up, point at a line and the cell does, name both halves of a transition and it fires.

`JSON.stringify(machine)` returns the graph — the schema without function bodies, but with their names. That is enough to draw, check and run the machine.

[**Open the inspector**](https://evgkch.github.io/fsmjs-inspector/)

---

## Table of contents

| Section                                                  | What it covers                                     |
| -------------------------------------------------------- | --------------------------------------------------- |
| [Installation](#installation)                            | Entry points, peer dependencies                    |
| [Ways of working](#ways-of-working)                      | The page, a running machine, embedding             |
| [`@evgkch/fsmjs-inspector`](#evgkchfsmjs-inspector)      | `inspect`, `close`, `RELAY`, what crosses the wire |
| [The relay](#the-relay)                                  | `scripts/relay.mjs`, the port                      |
| [`@evgkch/fsmjs-inspector/ui`](#evgkchfsmjs-inspectorui) | `overlay`, `mount`, `ensemble`, subjects, focus    |
| [Widgets](#widgets)                                      | Six custom elements and their `wiring`             |
| [Schemas](#schemas)                                      | Ready-made files, the rule language                |
| [Limitations](#limitations)                              | What to keep in mind                               |

---

## Installation

The inspector's pages and [the relay](#the-relay) — a WebSocket server through which the application under debugging hands its machines to the watching page — run from a clone of the repository. The application itself takes the npm package:

```sh
npm i -D @evgkch/fsmjs-inspector
```

The `inspect` call stays out of the production build:

```ts
if (import.meta.env.DEV) inspect(fsm, { name: "cart" });
```

If the widgets are part of the page's interface, the dependency is a regular one.

The package is ESM-only. Its one dependency of its own is `lit`, the custom-elements base. Peer dependencies — `@evgkch/fsmjs >= 0.2.1` and `@evgkch/channeljs >= 1.1.0`: neither is bundled, and the application must have exactly one copy of `fsmjs` (see [Limitations](#limitations)).

Entry points:

| Entry point    | What is in it                                                           |
| -------------- | ------------------------------------------------------------------------ |
| `.`            | `inspect`, `close`, `RELAY`. No DOM, no styles — fits a server or a worker |
| `./ui`         | `overlay`, `mount`, the widgets, the subjects. Importing attaches styles |
| `./style.css`  | Light-DOM styles: the `mount` grid and the `overlay` panel              |
| `./tokens.css` | The palette and the type; the widgets require it                        |

---

## Ways of working

**The ready-made page.** In a clone of the repository:

```sh
npm install
npm run dev
```

The inspector opens: the schema editor beside the figure. A schema is read from a file — a `JSON.stringify(machine)` dump or text in the rule language — written in the editor, or taken from the [ready-made ones](#schemas). The dump button writes what was typed back out as JSON.

**A running machine.** The relay and the watching page run in a clone of the repository:

```sh
npm run inspect      # the relay at ws://localhost:8999 and the watching page
```

The application under debugging gains one line:

```ts
import { inspect } from "@evgkch/fsmjs-inspector";

const cart = inspect(new StateMachine(schema, start), { name: "cart" });
```

`cart` appears on the page: its schema, its current state, and every new transition. There may be several machines — from one process or from many.

**On your own page.** The inspector embeds into the page under debugging — no relay and no second page: whole, through [`overlay`](#evgkchfsmjs-inspectorui), or one widget at a time (see [Widgets](#widgets)):

```ts
import { overlay } from "@evgkch/fsmjs-inspector/ui";
import "@evgkch/fsmjs-inspector/style.css";

const gone = overlay(cart);
// …
gone.close();
```

---

## `@evgkch/fsmjs-inspector`

The main entry point — what the application writes. No document and no styles: the process under debugging may have no DOM.

### `inspect`

```ts
function inspect<T extends AnyMachine>(fsm: T, opts?: Options): T;
```

`inspect` returns the machine it was given — the same object, with one listener on its bus. The call wraps a finished instance on the line where it is declared, and is erased after debugging.

| Option         | What it does                                                        |
| -------------- | -------------------------------------------------------------------- |
| `name?`        | The name on the inspector's page. Without one — `machine N`         |
| `description?` | A line about what the machine is for                                |
| `history?`     | A `history(fsm)` recorder from `@evgkch/fsmjs/debug` — turns rewinding on |
| `carry?`       | Send payloads and contexts with the steps — what JSON can write     |
| `url?`         | The relay's address, when it is not on this host. Defaults to `RELAY` |
| `link?`        | A channel of your own instead of the socket; then `url` is unused   |

Machines of one process share one socket per address: the connection opens on the first `inspect` and closes after the last machine leaves. On `pagehide` every machine sends `bye`.

### Rewinding

```ts
import { history } from "@evgkch/fsmjs/debug";

const past = history(cart);
inspect(cart, { name: "cart", history: past });
```

Rewinding from the inspector's window moves the machine in its own process, through the recorder that was handed over. Without `history` in the options the rewind controls on the page do nothing.

### What crosses the wire

Names only: the graph — the schema as `JSON.stringify` writes it — and the four types of every transition (`from`, `on`, `to`, `emit`). State contexts and event payloads do not leave the application's process. With `carry: true` a step also carries the payload, the reached context and the output event's payload — to the extent JSON can write them; a context with unserializable content gets its own `toJSON`. This data shows in the developer console on the inspector's page.

| Message | Sender          | What it carries                                          |
| ------- | --------------- | --------------------------------------------------------- |
| `hello` | the application | Everything about the machine: name, graph, state, run, capabilities |
| `step`  | the application | One transition and the machine's current state            |
| `bye`   | the application | The machine stopped publishing                            |
| `hail`  | the page        | A request for a fresh `hello` from every machine          |
| `jump`  | the page        | A command to the recorder: go to a record                 |

`hello` restates everything, so a page opened later, or one that missed messages, sends `hail` and is whole again. Delivery order does not matter; the relay stores nothing.

### `close`

```ts
function close(): void;
```

Sends `bye` for every machine and closes the sockets. A Node script needs it: an open socket holds the event loop, and without the call the process does not exit. A browser tab does not need it.

### Signatures

```ts
function inspect<T extends AnyMachine>(fsm: T, opts?: Options): T;
function close(): void;
const RELAY = "ws://localhost:8999";

type Options = {
  name?: string;
  description?: string;
  history?: Past;
  carry?: boolean;
  url?: string;
  link?: Link;
};

/** A recorder by shape — `History` from `fsmjs/debug` fits. */
type Past = {
  readonly index: number;
  jump(index: number): boolean;
  readonly rx: { on(msg: "moved", hear: (index: number) => void): () => boolean };
};
```

---

## The relay

The relay is a WebSocket server (`scripts/relay.mjs`). The application with its machines and the watching page both connect to it; neither knows about the other.

```sh
npm run inspect            # the relay and the watching page together
npm run relay              # the relay alone
node scripts/relay.mjs 9001   # your own port; otherwise PORT, otherwise 8999
```

The relay hands every message to every other client; it does not parse messages and stores nothing. If the port is already taken by another relay, the second instance prints one line and exits.

---

## `@evgkch/fsmjs-inspector/ui`

The second entry point — the inspector's interface, for embedding. Importing the module attaches `tokens.css`.

### `overlay`

```ts
function overlay(fsm: AnyMachine, options?: OverlayOptions): Overlaid;
```

Shows a running machine without the relay and without a second page: the figure and the run mount on this very page.

| Option     | What it does                                                    |
| ---------- | ----------------------------------------------------------------- |
| `into?`    | Where to mount. Without it — a floating panel over the page     |
| `title?`   | The caption in the panel's header                               |
| `history?` | A recorder, as in `inspect` — turns rewinding on                |
| `focus?`   | A focus shared with something else on the page                  |

The floating panel drags by its header and closes by the cross; `Overlaid.close()` does the same from code and releases the machine.

### `mount`

```ts
function mount(host: HTMLElement, subject: Subject, options?: ViewOptions): Handle;
```

Assembles the figure and the run in the given element and binds them: the run pages from the keyboard (`←`/`→`, `Home`/`End`, `Escape`), a named rule fires, the panels stand beside each other or in a column by the host's width. `ViewOptions` is the same `focus`.

```ts
type Handle = {
  readonly update: () => void; // redraw: the subject changed
  readonly enroll: (s: Member) => void; // register one more widget
  readonly fire: (id: RuleId) => void; // take a rule, if the machine can
  readonly destroy: () => void; // release the listeners and the DOM
};

/** A widget registered beside the mount's own pair: redrawn with it. */
type Surface = { draw(start: string): void; dress(): void };
/** A widget with a `wiring` property is wired at registration. */
type Member = Surface & { wiring?: { subject: Subject; focus: Focus } };
```

`enroll` registers a widget on the same subject and focus — `<fsmjs-diagram>`, for instance; the page wires nothing itself.

### `ensemble`

```ts
function ensemble(subject: Subject, cast: Cast, options?: { focus?: Focus; start?: string }): Ensemble;

type Cast = { figure?: FsmjsFigure; history?: FsmjsHistory; diagram?: FsmjsDiagram };
type Ensemble = {
  readonly focus: Focus;
  readonly start: string; // the state the rows are counted from
  readonly draw: () => void; // redraw every member
  readonly dress: () => void; // refresh the highlighting
  readonly fire: (id: RuleId) => void; // take a rule, if the machine can
  readonly rewind: (step: number) => void; // move the recorder, drop the selection
  readonly forget: () => void; // drop the selection and the pointer
  readonly enroll: (s: Member) => void;
  readonly destroy: () => void;
};
```

The binding without the markup. The widgets are independent: each hears the subject and draws itself; `ensemble` wires the members to a shared subject and focus and takes a rule named on any of them — once, in one place. `mount` is built on `ensemble` and adds the grid, the measuring and the keyboard; a page with markup of its own calls `ensemble` directly.

### Subjects

Everything draws from a subject — the interface "the graph, where we stand, what happened, how to move":

```ts
function fromMachine(fsm: AnyMachine, opts?: { history?: Past }): Subject;
function fromText(graph: Graph, start: string): Text;
```

`fromMachine` reads a live machine. Pressing a rule sends its event; which rule of the cell fires is decided by the guards in the application.

`fromText` builds a real machine out of a dump. A dump keeps guard names without code, so every rule gets the guard "is this the one named" — the named rule fires.

### Focus

```ts
function newFocus(): Focus; // what is chosen and what is pointed at — two machines and look()
```

Finite state machines on the same library. A shared `focus` on a page is shared highlighting.

---

## Widgets

The inspector's panels are published as custom elements. Importing any of them registers the element:

```ts
import {
  FsmjsFigure,
  FsmjsHistory,
  FsmjsEditor,
  FsmjsDiagram,
  FsmjsLegend,
} from "@evgkch/fsmjs-inspector/ui";
```

| Element           | Class          | What it draws                                            |
| ----------------- | -------------- | --------------------------------------------------------- |
| `<fsmjs-figure>`  | `FsmjsFigure`  | The transition figure: three blocks around two axes      |
| `<fsmjs-history>` | `FsmjsHistory` | The run: steps over state rows, rewinding by click       |
| `<fsmjs-editor>`  | `FsmjsEditor`  | The rule text with highlighting, a gutter and completion |
| `<fsmjs-diagram>` | `FsmjsDiagram` | The classic diagram: states in a row, transitions as arcs |
| `<fsmjs-legend>`  | `FsmjsLegend`  | A frameless row of capsules: `kind` — `states`, `in` or `out` |
| `<fsmjs-desk>`    | `FsmjsDesk`    | The desk: a menu of switches, and the others synchronized   |

A widget is configured through the `wiring` property — a JavaScript object, not an attribute. It draws into a shadow root with a stylesheet of its own; the page's styles do not reach inside. The palette does: the tokens are custom properties and inherit through the shadow, so `tokens.css` is required, and overriding a token changes the widget.

The minimal assembly of a figure with a run:

```ts
import {
  FsmjsFigure,
  FsmjsHistory,
  fromMachine,
  newFocus,
} from "@evgkch/fsmjs-inspector/ui";
import "@evgkch/fsmjs-inspector/tokens.css";

const subject = fromMachine(fsm);
const focus = newFocus();
const forget = () => {
  focus.choice.dispatch("drop");
  focus.pointer.dispatch("leave");
};
const start = subject.at;

const figure = new FsmjsFigure();
figure.wiring = { subject, focus, forget };
host.append(figure);
figure.draw(start); // nothing is drawn before draw

const run = new FsmjsHistory();
run.wiring = { subject, focus, rewind: (i) => subject.rewind?.(i) };
host.append(run);
run.show(subject.graph, start); // the order of the rows
run.draw();
```

`draw` is called again when the graph changed; `dress` — when only the focus moved. Individual widgets do not assemble the taking of a named rule; `mount` does. If you do not need your own panel order, use `mount`.

`<fsmjs-diagram>` wires the same way: `wiring = { subject, focus, fire? }`, then `draw(start)` — or `handle.enroll(diagram)`. `fire` takes a rule and drops the selection; `ensemble` passes its own, and without one the widget does both itself. States are cells in a row, transitions are arcs: leftward over the row, rightward under it, an arc in its target's colour. Rules that differ only in guard are one arrow; a rule with a different `emit` is its own line. The label is `on · when / emit`, to the extent the rule has a guard and an output: three `down` arrows out of one state read apart by their guard names. Pointing at an arc lights its rule in the figure and in the text; clicking an arc takes the rule, if the machine can, and drops the selection. A transition the machine takes runs its dashes along its own arc — on every step, whoever made it. The `on / emit` label answers for its arc — to pointing and to clicking alike. Clicking a state is a press in the shared choice: only its transitions stay on the table, the figure bands its row, the history draws the step's dashed candidates; `Escape` drops it, along with everything else. Pressing the outgoing state and then the incoming one takes the transition between them — a second way of taking, equal to the arc click; the same state twice is the self-loop. Pointing at the incoming state while the outgoing one is pressed bands the candidates in the figure: the source's row, the target's column, their events' columns and their outputs' rows.

`<fsmjs-legend>` is a frameless row of capsules with no controls: the `kind` attribute picks `states` (names in their lane colours, the current one filled in its own colour, unreachable ones struck through), `in` or `out`. The inspector's pages keep three such rows above the panels, each under its own switch.

`<fsmjs-desk>` is the desk: one widget that runs the others. Inside is an [`ensemble`](#ensemble) of its own; in the shadow — the menu, one switch per enrolled widget. The widgets stay in the page's markup; a switch turns its widget's `hidden` on and off.

```ts
import { FsmjsDesk, FsmjsDiagram, fromMachine } from "@evgkch/fsmjs-inspector/ui";
import "@evgkch/fsmjs-inspector/tokens.css";

const desk = new FsmjsDesk();
desk.wiring = { subject: fromMachine(fsm) };
bar.append(desk);

const diagram = new FsmjsDiagram();
host.append(diagram);
desk.enroll(diagram); // wiring, drawing and a switch
```

The switch's name is the tag without `fsmjs-`; several widgets of one tag are named by the second argument. `desk.seat(name, { locked?, title? })` is a switch without the wiring, for a panel the page shows and hides itself; its state reads off `desk.panels` — the panels machine. `desk.ensemble` is the binder (`fire`, `rewind`, `forget`, `draw`). The menu of both inspector pages is this very desk.

`<fsmjs-editor>` cannot yet be assembled from outside in full: its `show` takes parsed rules and check results, and the parser and their types are not exported from `./ui`. The editor's proper place is the inspector's page.

---

## Schemas

`schemas/` holds nine ready-made files. Six — `the-inspectors-*` — are the schemas of the inspector's own machines, written out of its sources by `npm run dump`. Three are written by hand: `selection-rectangle`, `upload-with-retry` and `a-schema-with-problems` — the last shows how dead rules and unreachable states are drawn.

A file reads in two forms: a JSON dump, and the library's rule language —

```text
FROM locked ON coin WHEN underCap TO locked WITH addCoin
FROM locked ON coin               TO open   WITH reset   EMIT opened
FROM open   ON pass               TO locked
```

`FROM`, `ON` and `TO` are required, the word order is fixed, comments run `#` or `//` to the end of the line. The round trip "text → schema → dump" returns the same schema, not an equivalent one.

---

## Limitations

- **The application must have exactly one copy of `@evgkch/fsmjs`.** Transitions publish on the `TRANSITION` symbol, and a second copy of the library has a symbol of its own — the `inspect` listener never hears it. When building from several bundles, Vite's `resolve.dedupe` helps.
- **A Node script needs `close()`.** An open socket holds the event loop; without the call the process does not exit.
- **Rewinding requires a recorder.** Without `history` in `inspect`'s options the rewind controls do nothing.
- **Names only cross the wire, unless `carry` says otherwise.** Dump guards do not run: the watching page sends the event, and which rule fires is decided by the machine in its own process. Without `carry: true`, contexts and payloads do not leave the application.
- **The widgets require `tokens.css`.** The palette reaches the shadow root through custom properties; without the tokens a widget is left without colours.

---

## License

MIT

---

<p align="center">
  <a href="https://github.com/evgkch/fsmjs">fsmjs</a> ·
  <a href="https://evgkch.github.io/fsmjs/">Examples</a> ·
  <a href="LICENSE">MIT</a>
</p>

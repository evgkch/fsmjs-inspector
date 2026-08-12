/**
 * The inspector: three blocks around two shared indices, and the trace of what has been done.
 *
 * A rule in a graph is a point (from, on, to, emit) — four discrete coordinates, and no drawing
 * has four axes. What it has instead is three blocks around two shared indices:
 *
 *            ┌─────────────┐
 *            │  TO × EMIT  │  3 — the columns are shared down this line
 *   ┌────────┼─────────────┤
 *   │FROM×ON │  FROM × TO  │  1 and 2 — the rows are shared across this one
 *   └────────┴─────────────┘
 *
 * Block 1 is the domain of δ: a row is a state, a column an event type, one cell is one (q, σ) —
 * the pair a `dispatch` is addressed by. Block 3 is the codomain, (r, λ) — and a rule that emits
 * nothing has no cell there, since there is no output to give it one, so the name of its column
 * is what names it. Block 2 is the same relation projected along Σ and Λ, so its cells are *sets*
 * of rules: several events may join one pair of states.
 *
 * 1 and 3 are the two halves of a transition, and neither is more its beginning than the other,
 * so they behave the same way. Pointing at a cell of either runs its two bands out to the names
 * on both axes — the one 2 has an axis for carrying on across it — and lights what the other half
 * could be. Pressing fixes that half: the bands stay, everything the choice rules out goes dark,
 * and what is left lit is the other half. Block 2 is where the band out of one half meets the
 * band into the other. It is a display and never a control: pointing at a corner lights the
 * causes and the outcomes that meet there, and there is nothing to press, because a crossing is
 * not something to choose.
 *
 * Which of that is happening at any moment is not worked out here. Which halves are held and
 * where the pointer is are two machines in `diagram.ts`; this file tells them what happened and
 * asks once, through `look`, how the board should be dressed. What is being *inspected* is a
 * `Subject` — a dump, or a machine that is running — and the figure never learns which.
 *
 * Nothing here computes anything about the graph on its own. `analysis` answers what the shape
 * is and what reaches what, `formatters` writes the labels, `edges` flattens the schema once.
 * What is left, and all that is here, is layout.
 */
import { TRANSITION, edges } from "@evgkch/fsmjs";
import type { Edge, Off } from "@evgkch/fsmjs";
import { analyze, validate } from "@evgkch/fsmjs/analysis";
import { edgeLabel } from "@evgkch/fsmjs/formatters";
import { CAUSE, CORNER, EFFECT, keyOf, kindOf, newDiagram } from "./diagram.js";
import type { Key } from "./diagram.js";
import { idOf } from "./subject.js";
import type { Graph, Step, Subject } from "./subject.js";

const SVG = "http://www.w3.org/2000/svg";

/** How a figure is being looked at, as opposed to what it is looking at. */
export type Options = {
  /**
   * No state is current: the whole schema is on the table and nothing fires. Off, the machine
   * stands somewhere, everything out of its reach is dim and does not even answer the pointer,
   * and naming both halves of a transition takes it.
   */
  exploring?: boolean;
};

export type Handle = {
  /** Draw again, because something about the subject changed. */
  readonly update: () => void;
  /** Look at it differently. */
  readonly set: (opts: Options) => void;
  /** Let go: listeners, the subject, and the DOM this put in the host. */
  readonly destroy: () => void;
};

/**
 * Put an inspector in an element and point it at a subject.
 *
 * Everything below this line is inside one mount: the elements, the two machines of the diagram,
 * and the state of the pointer. Two inspectors on a screen do not know about each other.
 */
export function mount(
  host: HTMLElement,
  subject: Subject,
  options: Options = {},
): Handle {
  let exploring = options.exploring ?? false;

  const { choice, pointer, look } = newDiagram();

  // ── the elements the inspector puts in its host ──
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls: string,
    text?: string,
  ) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const out = make("div", "out");
  const readingEl = make("div", "reading");
  const logEl = make("div", "log");
  const logTag = make("h2", "tag log-tag");
  logTag.append(make("span", "no", "#"), make("span", "", "history"));
  const undoBtn = make("button", "", "↶ undo") as HTMLButtonElement;
  const redoBtn = make("button", "", "↷ redo") as HTMLButtonElement;
  const startBtn = make("button", "", "↺ start") as HTMLButtonElement;
  const rewindEl = make("div", "rewind");
  rewindEl.append(undoBtn, redoBtn, startBtn);
  const trace = make("aside", "trace");
  trace.append(
    make("h2", "tag", "reading"),
    readingEl,
    logTag,
    logEl,
    rewindEl,
  );
  const work = make("div", "work");
  work.append(out, trace);
  const root = make("div", "fsmjs-inspector");
  root.append(work);
  host.append(root);

  const off: Off[] = [];
  const on = <T extends EventTarget>(
    node: T,
    type: string,
    run: (e: Event) => void,
  ) => {
    node.addEventListener(type, run);
    off.push(() => (node.removeEventListener(type, run), true));
  };

  /**
   * How the board now on screen puts its classes on. Set by `board`, and called from one place
   * only — the diagram's own transitions — so nothing anywhere has to remember to redraw.
   */
  let redress: (() => void) | null = null;

  off.push(choice.rx.on(TRANSITION, () => redress?.()));
  off.push(pointer.rx.on(TRANSITION, () => redress?.()));

  /**
   * The rule the figure last came down to. It is what the reading says when nothing is being
   * pointed at — and either way the next one replaces it.
   */
  let last: Edge[] = [];

  /**
   * Let the figure go.
   *
   * What it holds is about one graph, one position of the machine and one way of looking. Change
   * any of those and the halves it holds name something that is no longer there — so everything
   * that changes one of them says this, and nothing else has to think about it. The pointer goes
   * with them: whatever it was over is about to be rebuilt, so no `mouseleave` is coming for it.
   */
  function forget(): void {
    if (choice.can("drop")) choice.dispatch("drop");
    if (pointer.can("leave")) pointer.dispatch("leave");
  }

  // ── the figure ───────────────────────────────────────────────────────────────

  const CELL = 24; // one cell of any block, and with it the pitch of the lanes
  const EM = 7.2; // width of one monospace character at the size the labels use
  const LANES = 8; // the palette repeats after this many states

  const svg = <K extends keyof SVGElementTagNameMap>(
    name: K,
    attrs: Record<string, string | number>,
    text?: string,
  ): SVGElementTagNameMap[K] => {
    const node = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /**
   * The grid the three blocks stand on: `on` gives block 1's columns, `q` the columns blocks 2 and
   * 3 share, `λ` block 3's rows, and `row` the rows blocks 1 and 2 share.
   */
  type Geo = {
    names: number;
    spine: number;
    head: number;
    crown: number;
    width: number;
    on: (i: number) => number;
    q: (i: number) => number;
    λ: (i: number) => number;
    row: (j: number) => number;
  };

  function geometry(all: string[], outs: string[], evs: string[]): Geo {
    const w = (s: string) => s.length * EM;
    // One column of names down the middle, where blocks 1 and 2 meet: it labels the rows of the
    // one from its right and the rows of the other from its left, which is what a shared index
    // looks like when it is drawn once instead of twice.
    const wide = 22 + Math.max(30, ...all.map(w), ...outs.map(w));
    const left = 6;
    const spine = left + evs.length * CELL;
    const mid = spine + wide;
    const crown = outs.length ? 6 + outs.length * CELL + 10 : 0;
    const head = crown + 32 + Math.max(0, ...all.map(w), ...evs.map(w));
    return {
      names: spine + wide / 2,
      spine,
      head,
      crown,
      width: mid + all.length * CELL + 8,
      on: (i) => left + i * CELL + CELL / 2,
      q: (i) => mid + i * CELL + CELL / 2,
      λ: (i) => 6 + i * CELL + CELL / 2,
      row: (j) => head + j * CELL,
    };
  }

  /**
   * Does a key allow this rule.
   *
   * A key is a cell, and a cell is a subset of the rules. Read in the block where the inputs live
   * that subset is the preimage of a choice, and in the block where the outputs live it is the
   * image — the same set, projected the two ways, which is why narrowing needs no code of its own
   * and why pointing at any one of the three blocks says something about the other two.
   */
  function holds(key: Key, r: Edge): boolean {
    const [kind, a, b] = key.split("\0");
    switch (kind) {
      case CAUSE:
        return r.from === a && r.on === b;
      case CORNER:
        return r.from === a && r.to === b;
      case EFFECT:
        // `a` is empty for the outcome "arrives at b and emits nothing". That outcome has no cell
        // in block 3 — there is no output to give it one — so it is named on the `to` axis itself.
        return (r.emit ?? "") === a && r.to === b;
      default:
        return false;
    }
  }

  /** Everything the figure is drawn from, read off the schema once. Nothing here is a selection. */
  type Draw = {
    all: string[];
    evs: string[];
    outs: string[];
    geo: Geo;
    start: string;
    here: string;
    off: Set<string>; // states no run can reach from the start
    end: Set<string>; // states with nothing leaving them
    rows: Edge[];
    hue: (state: string) => string;
    cell: Map<string, Edge[]>; // from ╳ on — block 1
    pair: Map<string, Edge[]>; // from ╳ to — block 2
    shot: Map<string, Edge[]>; // emit ╳ to — block 3
    far: Set<string>; // from ╳ to — reachable, but not in one step
    id: (r: Edge) => string; // which rule this is, as the guards name it
    fires: (row: Edge) => boolean; // could the machine take it from where it stands
    dead: (row: Edge) => boolean; // dead in the dump, as `validate` reads it
  };

  function plan(graph: Graph, start: string): Draw {
    const rows = edges(graph);
    const facts = analyze(graph, start);
    // The states in the order a run meets them: `analyze` fills `reachable` breadth-first from
    // the start, so taking it as the axis puts the near states near the origin and leaves the
    // ones nothing reaches at the end, where their empty column is easy to see.
    const all = [...facts.reachable, ...facts.unreachable];
    const evs = [...new Set(rows.map((r) => r.on))];
    const outs = [...new Set(rows.flatMap((r) => (r.emit ? [r.emit] : [])))];

    const cell = new Map<string, Edge[]>();
    const pair = new Map<string, Edge[]>();
    const shot = new Map<string, Edge[]>();
    const push = (map: Map<string, Edge[]>, key: string, row: Edge) =>
      map.set(key, [...(map.get(key) ?? []), row]);
    for (const row of rows) {
      push(cell, `${row.from}\0${row.on}`, row);
      push(pair, `${row.from}\0${row.to}`, row);
      if (row.emit) push(shot, `${row.emit}\0${row.to}`, row);
    }

    // What is reachable but not adjacent — the part of the relation the text cannot show, since
    // reading it off a schema means following it. One `analyze` per state answers it, and the
    // union over a state's successors is what that state reaches in two steps or more.
    const reach = new Map(
      all.map((q) => [q, new Set<string>(analyze(graph, q).reachable)]),
    );
    const far = new Set<string>();
    for (const q of all)
      for (const row of rows)
        if (row.from === q)
          for (const t of reach.get(row.to) ?? [])
            if (!pair.has(`${q}\0${t}`)) far.add(`${q}\0${t}`);

    // A rule after an unguarded one in the same cell can never fire — in the dump. `validate`
    // reports that per cell, and the order inside the cell says which of its rules are the ones.
    const flagged = new Set(
      validate(graph, start)
        .filter((i) => i.kind === "dead-rule")
        .map((i) => `${i.node}\0${i.event}`),
    );

    const lane = new Map(all.map((n, i) => [n, i]));
    const geo = geometry(all, outs, evs);
    // Exploring, no state is current: the question is what the schema allows, not what this
    // machine can do next, and a marked row would answer the other question.
    const here = !exploring ? (subject?.at ?? start) : "";

    // Whether the machine could take this rule's event from where it stands. On a dump that is a
    // question about the cell; on a machine that is running it is a question its own guards answer.
    const drive = subject?.drive;
    const fires = (row: Edge) =>
      row.from === here && (drive?.can(idOf(rows, row)) ?? false);

    return {
      all,
      evs,
      outs,
      geo,
      start,
      here,
      off: new Set(facts.unreachable),
      end: new Set(facts.terminal),
      rows,
      hue: (state) => `--c: var(--lane-${(lane.get(state) ?? 0) % LANES})`,
      cell,
      pair,
      shot,
      far,
      id: (r) => idOf(rows, r),
      fires,
      dead: (row) =>
        flagged.has(`${row.from}\0${row.on}`) &&
        cell.get(`${row.from}\0${row.on}`)?.[0] !== row,
    };
  }

  function figure(graph: Graph, start: string): void {
    const wrap = document.createElement("div");
    wrap.className = "figure";
    const d = plan(graph, start);
    wrap.append(board(d));
    out.replaceChildren(wrap);
    chronicle(d);
  }

  const word = (text: string, cls: string, hue?: string) => {
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    if (hue !== undefined) span.setAttribute("style", hue);
    return span;
  };

  /**
   * A set of rules, written out: `FROM q ON σ → TO r EMIT λ`.
   *
   * The words are the library's own — the same sentence `toRules` prints and the same one `rules`
   * writes for a transition — so nothing on this page has a vocabulary of its own. Which side has
   * more than one line is what the figure was asked: naming a cause leaves the left alone and
   * lists what it can produce, naming an effect leaves the right alone and lists what could have
   * caused it, and pointing at a crossing can leave both with several.
   */
  function sentence(d: Draw, rules: Edge[]): HTMLElement {
    const say = (r: Edge, out: boolean): HTMLElement => {
      const row = document.createElement("div");
      row.className = "one";
      const q = out ? r.to : r.from;
      row.append(word(out ? "TO" : "FROM", "key"), word(q, "q", d.hue(q)));
      if (out) {
        if (r.emit !== undefined)
          row.append(word("EMIT", "key"), word(r.emit, "l"));
      } else row.append(word("ON", "key"), word(r.on, "s"));
      return row;
    };

    const side = (out: boolean): HTMLElement => {
      const column = document.createElement("div");
      column.className = "side";
      const seen = new Set<string>();
      for (const r of rules) {
        const key = out ? `${r.to}\0${r.emit ?? ""}` : `${r.from}\0${r.on}`;
        if (seen.has(key)) continue;
        seen.add(key);
        column.append(say(r, out));
      }
      return column;
    };

    const box = document.createElement("div");
    box.className = "say";
    box.append(side(false), word("→", "arrow"), side(true));
    return box;
  }

  /** A transition that happened, read as the rule it took. */
  const asEdge = (t: Step): Edge => ({
    from: t.source.type,
    on: t.input.type,
    to: t.target.type,
    emit: t.output?.type,
  });

  /** What is under the pointer, or held: overwritten every time, in both modes. */
  function reading(d: Draw, rules: Edge[]): void {
    readingEl.replaceChildren(
      rules.length ? sentence(d, rules) : word("point at a cell", "none"),
    );
  }

  /**
   * The transitions that were taken, in the order they were taken, and a way back to any of them.
   *
   * Exploring there are none, and there is nothing to keep: nothing fires, so the reading above is
   * the whole of what the figure has to say and the next pointer movement replaces it. Running,
   * every one of these happened, and rewinding does not unwrite what has been written — it only
   * moves where in them the machine stands.
   */
  function chronicle(d: Draw): void {
    logEl.replaceChildren();
    if (exploring || !subject) return;
    const at = subject.step;
    const told = (subject.steps as (Step & { line?: string })[]).map(
      (t) => t.line ?? "",
    );
    subject.steps.forEach((t, i) => {
      const line = told[i] ?? "";
      const row = document.createElement("button");
      row.className = `step${i + 1 === at ? " now" : ""}${i + 1 > at ? " ahead" : ""}`;
      row.title = line;
      // Which step this is. The machine's position is one of these numbers, and `history.jump`
      // takes exactly it, so the column is the index the rewinding is done by.
      row.append(word(String(i + 1), "no"), sentence(d, [asEdge(t)]));
      row.addEventListener("click", () => {
        subject?.rewind?.(i + 1);
        forget();
        paint();
      });
      logEl.append(row);
    });
    logEl.scrollTop = logEl.scrollHeight;
  }

  /**
   * The three blocks.
   *
   * Built once for a schema and a position of the machine, then *dressed*: every class the figure
   * wears is worked out in one pass from one value — what `look` says about the state the diagram
   * is in — and nothing anywhere else touches a class. That is why pointing at a cell and having
   * pressed it cannot come out looking different: they arrive in the same list, `shown`, and go
   * down the same line of code.
   */
  function board(d: Draw): SVGSVGElement {
    const g = d.geo;
    const height = g.row(d.all.length) + 8;
    const root = svg("svg", {
      class: "board",
      width: g.width,
      height,
      viewBox: `0 0 ${g.width} ${height}`,
    });

    /**
     * Something on the board that answers to the state of the figure. `key` is the cell it stands
     * for and `list` the rules drawn there; `base` is what it wears whatever the state is.
     */
    type Spot = {
      node: SVGElement;
      family: "box" | "name";
      key: Key;
      list: Edge[];
      base: string;
    };
    const spots: Spot[] = [];

    // The names along the axes. A name is one coordinate, so it is written where several cells can
    // claim it, and more than one node may say the same one.
    const tag = new Map<string, SVGElement[]>();
    const mark = <T extends SVGElement>(coord: string, node: T): T => {
      tag.set(coord, [...(tag.get(coord) ?? []), node]);
      return node;
    };
    /** The four coordinates of a rule, as the names along the axes write them. */
    const coords = (r: Edge) => [
      `from\0${r.from}`,
      `on\0${r.on}`,
      `to\0${r.to}`,
      `emit\0${r.emit ?? ""}`,
    ];
    const midL = g.q(0) - CELL / 2;
    const midR = g.q(d.all.length - 1) + CELL / 2;

    /**
     * The two bands of a cell: the lines it is the intersection of, run out to the names on both
     * axes so nothing has to be counted, and the one the middle block has an axis for carried on
     * across it. That is what the middle block is — the band out of one end of a transition meets
     * the band into the other there, and where they cross is the corner the rule goes through.
     */
    const bands = (key: Key): Record<string, number>[] => {
      const [kind, a, b] = key.split("\0");
      if (kind === CAUSE) {
        // The row is a state, which block 2 indexes too, so it goes the whole way across.
        const row = {
          x: 0,
          y: g.row(d.all.indexOf(a!)),
          width: midR,
          height: CELL,
        };
        const i = d.evs.indexOf(b!);
        if (i < 0) return [row];
        // The column is an event type, and there is no axis of those anywhere else — so it runs
        // up to the name that says which event, and stops.
        return [
          row,
          {
            x: g.on(i) - CELL / 2,
            y: g.crown,
            width: CELL,
            height: height - g.crown,
          },
        ];
      }
      if (kind === EFFECT) {
        const column = {
          x: g.q(d.all.indexOf(b!)) - CELL / 2,
          y: 0,
          width: CELL,
          height,
        };
        // `TO r` with nothing emitted is named on the name of the column: one band, and no row to
        // cross it, because there is no output and so no row it could be on.
        const i = a ? d.outs.indexOf(a) : -1;
        if (i < 0) return [column];
        // Out to the name of the output on one side, and to the edge of the block on the other.
        return [
          column,
          {
            x: g.spine,
            y: g.λ(i) - CELL / 2,
            width: midR - g.spine,
            height: CELL,
          },
        ];
      }
      // A corner of block 2 is a crossing, not a cell of either index: nothing runs out from it.
      return [];
    };

    const lanes = svg("g", { class: "wash" });

    /**
     * Everything that depends on the state of the figure, in one pass over the board.
     *
     * Two predicates carry it. `play` is what is still on the table: the mode says whether the
     * machine could get there at all, and every end already fixed says whether the choice allows
     * it. `shows` is what is being pointed at or has been fixed — and it is one predicate, not
     * two, which is the whole reason a click keeps exactly the light the pointer had.
     */
    const dress = () => {
      const { fixed, shown, open } = look();

      const play = (r: Edge) =>
        (exploring || d.fires(r)) && fixed.every((k) => holds(k, r));
      const shows = (r: Edge) =>
        shown.length > 0 && shown.every((k) => holds(k, r));

      for (const s of spots) {
        // Three states, and the diagram is a hard enough object without a fourth. A cell is out
        // of reach; or the figure is about it — pointed at, or held, which are the same look
        // because they are the same thing seen twice; or it is neither and just there. Never two
        // at once: a cell out of reach does not answer the pointer, and a half can only be held
        // if it was in reach when it was pressed.
        const alive = s.list.some(play);
        const hot =
          fixed.includes(s.key) || (open.includes(kindOf(s.key)) && alive);
        const cls = [s.base];
        if (s.family === "box")
          cls.push(!alive ? "dim" : s.list.some(shows) ? "lit" : "");
        if (hot) cls.push("hot");
        s.node.setAttribute("class", cls.filter(Boolean).join(" "));
        s.node.setAttribute("tabindex", hot ? "0" : "-1");
      }

      // A name says one coordinate, so it says less than a cell and says it about more rules:
      // pointing at a corner of block 2 lights every ON the rules there go out on and every EMIT
      // they arrive with, and every name of one.
      const shine = new Set<string>();
      for (const r of d.rows)
        if (shows(r)) for (const c of coords(r)) shine.add(c);
      // A name is lit or it is not: which half was held is what the bands say, and saying it
      // twice would be a second thing to read.
      for (const [coord, nodes] of tag)
        for (const node of nodes)
          node.classList.toggle("lit", shine.has(coord));

      // A crossing has no bands, so aiming through one adds none: `bands` says so, and nothing
      // here has to know which kind of key it is looking at.
      lanes.replaceChildren(
        ...shown
          .flatMap(bands)
          .map((box) => svg("rect", { ...box, class: "lit-lane" })),
      );

      const rules = d.rows.filter(shows);
      reading(d, rules.length ? rules : last);
    };

    /**
     * A press, and that is the whole of it: hand the key over and let the guards say what it
     * meant. Nothing here asks which half it was, how many are named now, or what to redraw — the
     * diagram's own transition does the redrawing, and a move of the machine on the board is what
     * lets the selection go. A press is not a place where any of that is decided.
     */
    const choose = (key: Key) => choice.dispatch("press", { key });

    /**
     * Wire a cell up. Pointing at it and pressing it are both one dispatch: the machine is told
     * what happened, and the board is dressed from what it says.
     */
    const wire = (s: Spot): SVGElement => {
      spots.push(s);
      // A cell that is out of reach does not answer the pointer. One rule for both modes: what is
      // out of reach differs between them — running, the machine has to be able to get there —
      // but a variant a choice has already ruled out is ruled out either way, and lighting one
      // would offer something that cannot be taken.
      const on = () => {
        if (s.node.classList.contains("dim")) return;
        pointer.dispatch("enter", { key: s.key });
      };
      const off = () => pointer.dispatch("leave");
      s.node.addEventListener("mouseenter", on);
      s.node.addEventListener("mouseleave", off);
      s.node.addEventListener("focus", on);
      s.node.addEventListener("blur", off);
      // A crossing is shown and aimed through, never held — the machine's guard says so too, but
      // there is no reason to offer a press that would be refused.
      if (kindOf(s.key) === CORNER) return s.node;
      // What the figure offers is what `dress` lit; pressing anything else is nothing at all.
      const take = () => {
        if (s.node.classList.contains("hot")) choose(s.key);
      };
      s.node.setAttribute("role", "button");
      s.node.addEventListener("click", take);
      s.node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          take();
        }
      });
      return s.node;
    };

    // Clicking anywhere that is not a cell lets the whole selection go.
    const floor = svg("rect", {
      x: 0,
      y: 0,
      width: g.width,
      height,
      class: "floor",
    });
    floor.addEventListener("click", forget);
    // The bands go in before anything else is drawn: they are the background of the rows and the
    // columns, and a background over the top of the cells is not one.
    root.append(floor, lanes);

    // The lanes run through the whole figure: the columns of block 2 are the columns of block 3,
    // and drawing them as one line is what says so. They stop for the band of names, so nothing is
    // struck through.
    d.all.forEach((n, i) => {
      const rail = (y1: number, y2: number) =>
        root.append(
          svg("line", {
            x1: g.q(i),
            y1,
            x2: g.q(i),
            y2,
            class: "rail",
            style: d.hue(n),
          }),
        );
      if (g.crown) rail(6, g.crown - 10);
      rail(g.head, height);
    });

    // Blocks 1 and 2 share their rows the way 2 and 3 share their columns, so a row is drawn as the
    // same kind of line. Both stop at the band of names — the index they are shared by, and the one
    // place a line would strike a word out.
    d.all.forEach((n, j) => {
      const y = g.row(j) + CELL / 2;
      const beam = (x1: number, x2: number) =>
        root.append(
          svg("line", { x1, y1: y, x2, y2: y, class: "rail", style: d.hue(n) }),
        );
      if (d.evs.length) beam(6, g.spine);
      if (d.all.length) beam(midL, midR);
    });

    // ── block 3: what comes out on arrival ──
    d.outs.forEach((λ, i) => {
      const y = g.λ(i);
      root.append(
        mark(
          `emit\0${λ}`,
          svg(
            "text",
            {
              x: g.names,
              y: y + 4,
              class: "name out",
              "text-anchor": "middle",
            },
            λ,
          ),
        ),
      );

      d.all.forEach((to, k) => {
        const list = d.shot.get(`${λ}\0${to}`);
        if (!list) return;
        const box = svg("g", { style: d.hue(to) });
        box.append(
          svg("rect", {
            x: g.q(k) - CELL / 2 + 3,
            y: y - CELL / 2 + 3,
            width: CELL - 6,
            height: CELL - 6,
            rx: 5,
          }),
        );
        box.append(svg("title", {}, `TO ${to} EMIT ${λ}`));
        root.append(
          wire({
            node: box,
            family: "box",
            key: keyOf(EFFECT, λ, to),
            list,
            base: "box shot",
          }),
        );
      });
    });
    // ── the axes: three words, and the figure needs no others ──
    root.append(
      svg(
        "text",
        { x: g.names, y: g.head - 10, class: "cap", "text-anchor": "middle" },
        "from",
      ),
    );
    if (d.evs.length)
      root.append(
        svg(
          "text",
          { x: g.on(0) - CELL / 2, y: g.crown + 12, class: "cap" },
          "on",
        ),
      );
    if (d.all.length)
      root.append(
        svg(
          "text",
          { x: g.q(0) - CELL / 2, y: g.crown + 12, class: "cap" },
          "to",
        ),
      );

    const stood = (
      x: number,
      y: number,
      name: string,
      cls: string,
      hue?: string,
    ) =>
      svg(
        "text",
        {
          x,
          y,
          class: cls,
          "text-anchor": "start",
          transform: `rotate(-90, ${x}, ${y})`,
          ...(hue !== undefined && { style: hue }),
        },
        name,
      );

    d.evs.forEach((σ, i) => {
      root.append(mark(`on\0${σ}`, stood(g.on(i), g.head - 8, σ, "name on")));
    });

    // `TO r` with nothing emitted is an outcome the grid above has no cell for — there is no output
    // to give it one, and a row for it would be a symbol the language does not have. What the
    // figure does have is the name of the column, which is where `TO r` is written and has been all
    // along. So the name is that outcome's cell, and nothing is drawn behind it.
    d.all.forEach((to, i) => {
      const ends = d.rows.filter((r) => r.emit === undefined && r.to === to);
      const name = mark(
        `to\0${to}`,
        stood(
          g.q(i),
          g.head - 20,
          to,
          `name${to === d.here ? " here" : ""}${d.off.has(to) ? " off" : ""}`,
          d.hue(to),
        ),
      );
      root.append(name);
      if (ends.length) {
        // A word stood on end is a small thing to hit, so the heading it stands in takes the
        // pointer for it — painted as nothing at all, because what a name has behind it is the
        // page, and the name lighting up is what says it can be clicked.
        const grab = svg("rect", {
          x: g.q(i) - CELL / 2,
          y: g.crown + 16,
          width: CELL,
          height: g.head - g.crown - 20,
          class: "grab",
        });
        grab.append(svg("title", {}, `TO ${to}, and nothing is emitted`));
        root.append(grab);
        wire({
          node: name,
          family: "name",
          key: keyOf(EFFECT, "", to),
          list: ends,
          base: name.getAttribute("class")!,
        });
        // The two are one control: the name is what is lit, the heading is what is hit.
        grab.addEventListener("mouseenter", () =>
          name.dispatchEvent(new Event("mouseenter")),
        );
        grab.addEventListener("mouseleave", () =>
          name.dispatchEvent(new Event("mouseleave")),
        );
        grab.addEventListener("click", () =>
          name.dispatchEvent(new Event("click")),
        );
      }
    });

    // ── the rows: blocks 1 and 2, sharing them ──

    /**
     * One cell of a lower block. It stays one square whatever it holds: the intersection the
     * controls address is (from, on), and there a cell is one `dispatch` — the rules inside it are
     * alternatives its guards decide between, not choices offered to the reader.
     */
    const square = (
      x: number,
      y: number,
      list: Edge[],
      tint: string,
      key: Key,
    ): SVGGElement => {
      const box = svg("g", { style: tint });
      box.append(
        svg("rect", {
          x: x - CELL / 2 + 2.5,
          y: y - CELL / 2 + 2.5,
          width: CELL - 5,
          height: CELL - 5,
          rx: 5,
        }),
      );
      // What the dump lost, flagged where it was lost: `validate`, reading the schema as text,
      // finds a rule here that an unguarded one ahead of it would always beat. Splitting the cell
      // to show which would say the cell is a choice — a corner flag says only that it is there.
      if (list.some(d.dead))
        box.append(
          svg("path", {
            d: `M ${x + CELL / 2 - 8.5} ${y - CELL / 2 + 2.5} L ${x + CELL / 2 - 2.5} ${y - CELL / 2 + 2.5} L ${x + CELL / 2 - 2.5} ${y - CELL / 2 + 8.5} Z`,
            class: "flag",
          }),
        );
      box.append(
        svg(
          "title",
          {},
          list.map(edgeLabel).join("\n") +
            (list.some(d.dead)
              ? "\n\n`validate` calls a rule here dead: read back as a dump, an unguarded rule " +
                "ahead of it in this cell would always win. Here the guard is your second click."
              : ""),
        ),
      );
      wire({ node: box, family: "box", key, list, base: "box" });
      return box;
    };

    d.all.forEach((from, j) => {
      const y = g.row(j);
      const row = svg("g", { class: "row" });
      // Where the machine stands, on the index of states — the one place that fact belongs, and
      // the one mark on the figure that is not a cell. Exploring there is no such state, so there
      // is no dot, which is the whole visible difference between the two.
      if (from === d.here)
        row.append(
          svg("circle", {
            cx: g.spine + 6,
            cy: y + CELL / 2,
            r: 3.5,
            style: d.hue(from),
            class: "mark",
          }),
        );
      row.append(
        mark(
          `from\0${from}`,
          svg(
            "text",
            {
              x: g.names,
              y: y + CELL / 2 + 4,
              class: `name side${from === d.here ? " here" : ""}${d.off.has(from) ? " off" : ""}`,
              style: d.hue(from),
              "text-anchor": "middle",
            },
            from,
          ),
        ),
      );

      // Block 1 is one end of a transition: a cell is one (state, event), which is what `dispatch`
      // is addressed by. No lane colour here — the columns are events, and where a rule leads is
      // what the lit column of block 2 says. One meaning per colour.
      d.evs.forEach((σ, i) => {
        const list = d.cell.get(`${from}\0${σ}`);
        if (list)
          row.append(
            square(g.on(i), y + CELL / 2, list, "", keyOf(CAUSE, from, σ)),
          );
      });

      d.all.forEach((to, i) => {
        const list = d.pair.get(`${from}\0${to}`);
        if (list) {
          row.append(
            square(
              g.q(i),
              y + CELL / 2,
              list,
              d.hue(to),
              keyOf(CORNER, from, to),
            ),
          );
          return;
        }
        if (!d.far.has(`${from}\0${to}`)) return;
        // Reachable, but not in one step. The dot is the part of the relation that is not in the
        // text at any one place: it is there only as the composition of what is.
        const dot = svg("circle", {
          cx: g.q(i),
          cy: y + CELL / 2,
          r: 2.5,
          class: "far",
        });
        dot.append(
          svg(
            "title",
            {},
            from === to
              ? `${from} lies on a cycle: a run can come back to it`
              : `${to} is reachable from ${from}, but not by one rule`,
          ),
        );
        row.append(dot);
      });

      root.append(row);
    });

    redress = dress;
    dress();
    return root;
  }
  // ── the run ──

  function paint(): void {
    undoBtn.disabled = !subject.rewind || subject.step === 0;
    redoBtn.disabled = !subject.rewind || subject.step >= subject.steps.length;
    startBtn.disabled = !subject.rewind || subject.step === 0;
    redress = null;
    logEl.replaceChildren();
    readingEl.replaceChildren();
    figure(subject.graph, subject.at || firstOf(subject.graph));
  }

  /** Where a figure with no current state starts counting from. */
  const firstOf = (graph: Graph) => Object.keys(graph)[0] ?? "";

  const rewindTo = (step: number) => {
    subject.rewind?.(step);
    forget();
    paint();
  };
  on(undoBtn, "click", () => rewindTo(subject.step - 1));
  on(redoBtn, "click", () => rewindTo(subject.step + 1));
  on(startBtn, "click", () => rewindTo(0));

  // Esc lets a selection go all at once, where pressing a named half walks it back one step.
  on(document, "keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") forget();
  });

  off.push(subject.watch(() => paint()));
  paint();

  return {
    update: paint,
    set: (opts) => {
      if (opts.exploring !== undefined) exploring = opts.exploring;
      forget();
      paint();
    },
    destroy: () => {
      for (const it of off) it();
      root.remove();
    },
  };
}

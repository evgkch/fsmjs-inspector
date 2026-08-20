/**
 * The classic diagram: the states in one row of cells, the transitions as arcs — a leftward one
 * over the row, a rightward one under it, each in its target's colour, `on / emit` at its middle.
 *
 * Custom element `<fsmjs-diagram>`, drawn into a shadow root; the palette comes in through
 * inherited custom properties. Pointing at an arc names both halves of its rule, so a figure and
 * an editor on the same focus light the same rule.
 */
import type { Off } from "@evgkch/fsmjs";
import { edgeLabel } from "@evgkch/fsmjs/formatters";
import {
  CORNER,
  SOURCE,
  halvesOf,
  holds,
  keyOf,
  kindOf,
  shows,
} from "../../entities/cell/index.js";
import type { Key } from "../../entities/cell/index.js";
import type { Change, RuleId, Subject } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { canFire, take } from "../../features/take-rule/index.js";
import { make, svg } from "../../shared/lib/dom.js";
import type { Row } from "../../shared/lang/rules.js";
import { CELL } from "../../shared/lib/grid.js";
import { shadow } from "../../shared/lib/shadow.js";
import { STEP, TIP, lay } from "./model/lay.js";
import type { Arc, Chip, Lay } from "./model/lay.js";
import diagramCss from "./ui/diagram.css?raw";

/** Radius of an arc's two turns. */
const BEND = 6;

/** A state's corner: half its height — a stadium, as a classic diagram draws a state. */
const ROUND = CELL / 2;

/** Half-width of an arrowhead. */
const HALF = 4;

export type Wiring = {
  subject: Subject;
  focus: Focus;
  /** Take a rule. The ensemble passes its own — take and let the selection go; alone, the widget
   * takes and forgets itself. */
  fire?: (id: RuleId) => void;
};

export class FsmjsDiagram extends HTMLElement {
  #w?: Wiring;

  /** The shadow root the diagram is drawn into. */
  #root: ShadowRoot;

  #l: Lay | null = null;
  #start = "";
  #here = "";

  /** What `draw` put on screen, so a move re-marks without re-laying. */
  #chips = new Map<string, SVGGElement>();
  #arcs: {
    g: SVGGElement;
    cap: SVGTextElement;
    rows: Row[];
    ids: RuleId[];
  }[] = [];

  /** The cell under the pointer — the soft version of the press. */
  #over: string | null = null;

  /** Stops hearing the subject, while this is put down. */
  #off: Off | null = null;

  /** Running: where this step can end. Null when everything is in reach. */
  #reach: Set<string> | null = null;

  /** Puts the taken arrow's dashes out, a moment after the step. */
  #cool: ReturnType<typeof setTimeout> | undefined;

  /** The arrow whose dashes are running, so a repeated step extends the run, not restarts it. */
  #ran: SVGGElement | null = null;

  constructor() {
    super();
    this.className = "diagram";
    this.#root = shadow(this, diagramCss);
  }

  connectedCallback(): void {
    // Subscribe here, not in `wiring`: a diagram taken out and put back hears the subject again.
    if (this.#off || !this.#w) return;
    this.#off = this.#w.subject.watch((what) => this.#moved(what));
  }

  disconnectedCallback(): void {
    this.#off?.();
    this.#off = null;
  }

  set wiring(w: Wiring) {
    // Rewired: stop hearing the old subject; already in the page, hear the new one now.
    this.#off?.();
    this.#off = null;
    this.#w = w;
    if (this.isConnected)
      this.#off = w.subject.watch((what) => this.#moved(what));
  }

  get wiring(): Wiring {
    return this.#w!;
  }

  draw(start: string): void {
    const w = this.#w;
    if (!w) return;
    this.#start = start;
    const l = lay(w.subject.graph, start);
    this.#l = l;
    this.#chips.clear();
    this.#arcs = [];
    this.#over = null;
    const chart = svg("svg", {
      class: "chart",
      width: l.width,
      height: l.height,
      viewBox: `0 0 ${l.width} ${l.height}`,
    });
    // Arcs first, cells over them, labels over everything: an arrow crossing a label would
    // otherwise strike it through.
    const caps = svg("g", { class: "caps" });
    for (const a of l.arcs) chart.append(this.#arc(a, l, caps));
    for (const c of l.chips) chart.append(this.#chip(c, l));
    chart.append(caps);
    const plot = make("div", "plot");
    plot.append(chart);
    this.#root.replaceChildren(make("div", "tag", "diagram"), plot);
    this.#moved();
  }

  #chip(c: Chip, l: Lay): SVGGElement {
    const g = svg("g", {
      class: c.off ? "chip off" : "chip",
      style: c.hue,
    });
    g.append(
      svg("rect", { x: c.x, y: l.base, width: c.w, height: CELL, rx: ROUND }),
      svg(
        "text",
        {
          x: c.x + c.w / 2,
          y: l.base + CELL / 2,
          "text-anchor": "middle",
          "dominant-baseline": "central",
        },
        c.q,
      ),
    );
    // A press goes into the choice, where the figure's presses go, so Escape, the figure's
    // floor, a rewind and a taken rule all let it go the same way. Pointing goes into the
    // pointer: a source names every rule leaving it, a target beside a held source names the
    // corner — so the text, the figure and the history light the same rules.
    const name = () => {
      const held = this.#heldQ();
      const keys =
        held !== null && held !== c.q
          ? [keyOf(CORNER, held, c.q)]
          : [keyOf(SOURCE, c.q, "")];
      this.#w!.focus.pointer.dispatch("enter", {
        keys,
        offer: true,
        alive: true,
      });
    };
    g.addEventListener("click", () => {
      const w = this.#w!;
      // Running, a press is offered where the step can end — the current state and the
      // fireable arrows' targets; the rest is dimmed and deaf, as on the figure.
      const alive = this.#reach === null || this.#reach.has(c.q);
      w.focus.choice.dispatch("press", {
        key: keyOf(SOURCE, c.q, ""),
        alive,
      });
      name();
      this.#redress();
    });
    g.addEventListener("pointerenter", () => {
      this.#over = c.q;
      name();
      this.#redress();
    });
    g.addEventListener("pointerleave", () => {
      this.#over = null;
      // The hold is in the choice and stays shown; only the pointer's naming goes.
      this.#w!.focus.pointer.dispatch("leave");
      this.#redress();
    });
    this.#chips.set(c.q, g);
    return g;
  }

  #arc(a: Arc, l: Lay, caps: SVGGElement): SVGGElement {
    const w = this.#w!;
    const g = svg("g", { class: a.dead ? "arc dead" : "arc", style: a.hue });
    // Up is +1, down is -1: one path for both sides, mirrored around the row of cells.
    const dir = a.side === "top" ? 1 : -1;
    const lip = a.side === "top" ? l.base : l.base + CELL;
    const y = lip - dir * a.level * STEP;
    const turn = Math.sign(a.x1 - a.x0) * BEND;
    const d = [
      `M ${a.x0} ${lip}`,
      `L ${a.x0} ${y + dir * BEND}`,
      `Q ${a.x0} ${y} ${a.x0 + turn} ${y}`,
      `L ${a.x1 - turn} ${y}`,
      `Q ${a.x1} ${y} ${a.x1} ${y + dir * BEND}`,
      `L ${a.x1} ${lip - dir * TIP}`,
    ].join(" ");
    g.append(
      // The casing under the ink: an arc drawn later — a longer one — cuts a small bridge
      // through the lines it crosses.
      svg("path", { class: "gap", d }),
      svg("path", { class: "line", d }),
      svg("polygon", {
        points: [
          `${a.x1 - HALF},${lip - dir * TIP}`,
          `${a.x1 + HALF},${lip - dir * TIP}`,
          `${a.x1},${lip}`,
        ].join(" "),
      }),
      svg("title", {}, a.rows.map(edgeLabel).join("\n")),
    );
    const cap = svg(
      "text",
      {
        class: a.dead ? "dead" : "",
        style: a.hue,
        x: (a.x0 + a.x1) / 2,
        y: dir === 1 ? y - 4 : y + 12,
      },
      a.label,
    );
    cap.append(svg("title", {}, a.rows.map(edgeLabel).join("\n")));
    caps.append(cap);
    // An arrow's rules share all four labels, so its two halves name it exactly — the way a
    // text line names its rule.
    const name = () =>
      w.focus.pointer.dispatch("enter", {
        keys: halvesOf(a.rows[0]!),
        offer: true,
        alive: true,
      });
    const leave = () => w.focus.pointer.dispatch("leave");
    // A click takes the first rule of the arrow the machine can take now — through the wired
    // `fire`, so the taking and the letting-go live in one place, the binder's.
    const strike = () => {
      for (const id of a.ids)
        if (canFire(w.subject, id)) return void this.#fire(id);
    };
    // The label answers for its arrow: pointing and clicking it is pointing and clicking the arc.
    for (const node of [g, cap] as const) {
      node.addEventListener("pointerenter", name);
      node.addEventListener("pointerleave", leave);
      node.addEventListener("click", strike);
    }
    this.#arcs.push({ g, cap, rows: a.rows, ids: a.ids });
    return g;
  }

  /** The machine moved: only the mark moves, so re-dressing is enough. */
  #moved(what?: Change): void {
    const w = this.#w;
    if (!w || !this.#l) return;
    this.#here = w.subject.at || this.#start;
    this.#redress();
    if (what?.say === "step") this.#flash();
    else {
      for (const { g } of this.#arcs) g.classList.remove("took");
      this.#ran = null;
    }
  }

  /**
   * The step just taken runs its dashes on its own arrow — one arrow, however many are open. A
   * repeated step on the same arrow — a drag is one transition at pointer rate — extends the
   * run; it neither restarts the animation nor forces a layout, which is what kept the dashes
   * frozen and the page busy.
   */
  #flash(): void {
    const w = this.#w;
    const s = w?.subject.steps[w.subject.steps.length - 1];
    if (!s) return;
    const from = String(s.source.type);
    const on = String(s.input.type);
    const to = String(s.target.type);
    const emit = s.output === undefined ? undefined : String(s.output.type);
    const hit =
      this.#arcs.find(({ rows }) =>
        rows.some(
          (r) =>
            r.from === from && r.on === on && r.to === to && r.emit === emit,
        ),
      )?.g ?? null;
    if (hit !== this.#ran) {
      this.#ran?.classList.remove("took");
      hit?.classList.add("took");
      this.#ran = hit;
    }
    clearTimeout(this.#cool);
    if (hit)
      this.#cool = setTimeout(() => {
        hit.classList.remove("took");
        this.#ran = null;
      }, 700);
  }

  /** Take the rule and let the selection go: it named a position the machine has left. */
  #fire(id: RuleId): void {
    const w = this.#w!;
    if (w.fire) return w.fire(id);
    take(w.subject, id);
    w.focus.choice.dispatch("drop");
    w.focus.pointer.dispatch("leave");
  }

  /** The held source, read out of the choice — a press here or anywhere else in the ensemble. */
  #heldQ(): string | null {
    const key = this.#w?.focus.look().fixed.find((k) => kindOf(k) === SOURCE);
    return key ? (key.split("\0")[1] ?? null) : null;
  }

  #redress(): void {
    const w = this.#w;
    if (!w || !this.#l) return;
    const { fixed, shown } = w.focus.look();
    // As the figure reads it: drivable, only what can fire stays on the table; a machine
    // watched from elsewhere is not dimmed.
    const acting = !!w.subject.drive;
    // The soft press: while nothing is held, pointing at a cell filters like a press would.
    // Only while the focus says something is named — Escape empties it with the rest.
    const over = fixed.length === 0 && shown.length > 0 ? this.#over : null;
    // On the table: allowed by every held key — the same test the figure dims cells by.
    const allowed = (r: Row) =>
      fixed.every((k: Key) => holds(k, r)) &&
      (over === null || r.from === over);
    // Running, where this step can end: the current state and the fireable arrows' targets.
    const reach = acting ? new Set(this.#here ? [this.#here] : []) : null;
    const filtering = fixed.length > 0 || over !== null;
    const near = filtering ? new Set<string>() : null;
    if (over !== null) near!.add(over);
    const heldQ = this.#heldQ();
    if (heldQ !== null) near?.add(heldQ);
    // The ends of the named arrows shine like the figure's names — dimmed or not.
    const shine = new Set<string>();
    for (const { g, cap, rows, ids } of this.#arcs) {
      const can = ids.some((id) => canFire(w.subject, id));
      if (can) reach?.add(rows[0]!.to);
      const dim = acting && !can;
      const far = !rows.some(allowed);
      if (!far) near?.add(rows[0]!.from).add(rows[0]!.to);
      // Named lights even a dimmed arrow — pointing at its line in the text, at its step in the
      // history — the way the figure runs its bands across dimmed cells.
      const lit = !far && rows.some((r) => shows(shown, r));
      if (lit) shine.add(rows[0]!.from).add(rows[0]!.to);
      g.classList.toggle("lit", lit);
      g.classList.toggle("dim", dim);
      g.classList.toggle("far", far);
      cap.classList.toggle("mute", (dim || far) && !lit);
      g.classList.toggle("can", acting && can);
      cap.classList.toggle("can", acting && can);
    }
    for (const [q, g] of this.#chips) {
      g.classList.toggle("here", this.#here !== "" && q === this.#here);
      g.classList.toggle("held", q === heldQ);
      g.classList.toggle("lit", shine.has(q));
      g.classList.toggle("far", near !== null && !near.has(q));
      g.classList.toggle("dim", reach !== null && !reach.has(q));
    }
    this.#reach = reach;
  }

  dress(): void {
    this.#redress();
  }
}

if (!customElements.get("fsmjs-diagram"))
  customElements.define("fsmjs-diagram", FsmjsDiagram);

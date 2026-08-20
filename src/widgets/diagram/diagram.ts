/**
 * The classic diagram: the states in one row of cells, the transitions as arcs — a leftward one
 * over the row, a rightward one under it, each in its target's colour, `on · when / emit` at its
 * middle.
 *
 * Custom element `<fsmjs-diagram>`, on Lit: the whole picture is one template over the layout
 * and the focus, and a dress is a re-render the differ reduces to class changes. Pointing at an
 * arc names both halves of its rule, so a figure and an editor on the same focus light the same
 * rule.
 */
import { html, svg, nothing } from "lit";
import type { TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
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
import type { Row } from "../../shared/lang/rules.js";
import { CELL } from "../../shared/lib/grid.js";
import { FsmjsElement, sheets } from "../../shared/lib/element.js";
import { STEP, TIP, lay } from "./model/lay.js";
import type { Arc, Lay } from "./model/lay.js";
import type { Graph } from "../../entities/machine/index.js";
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

/** An arc's identity across renders: what the flash holds on to. */
const idOf = (a: Arc): string => {
  const r = a.rows[0]!;
  return `${r.from}\0${r.on}\0${r.to}\0${r.emit ?? ""}`;
};

export class FsmjsDiagram extends FsmjsElement<Change, Wiring> {
  static override styles = sheets(diagramCss);

  /** The cell under the pointer — the soft version of the press. */
  #over: string | null = null;

  /** Running: where this step can end. Written by the last render, read by a chip's press. */
  #reach: Set<string> | null = null;

  /** The arrow whose dashes are running, so a repeated step extends the run, not restarts it. */
  #ran: string | null = null;

  /** Puts the taken arrow's dashes out, a moment after the step. */
  #cool: ReturnType<typeof setTimeout> | undefined;

  /** The layout, computed once per graph and start — a dress re-renders without re-laying. */
  #laid: { graph: Graph; start: string; value: Lay } | null = null;

  constructor() {
    super();
    this.className = "diagram";
  }

  /** The machine moved: the mark and the classes move; a step runs its arrow's dashes. */
  protected override moved(what: Change): void {
    if (what.say === "step") this.#flash();
    else if (this.#ran !== null) {
      clearTimeout(this.#cool);
      this.#ran = null;
    }
    this.requestUpdate();
  }

  /**
   * The step just taken runs its dashes on its own arrow. A repeated step on the same arrow — a
   * drag is one transition at pointer rate — extends the run without touching the DOM, so the
   * animation neither restarts nor costs a layout.
   */
  #flash(): void {
    const w = this.w;
    const s = w?.subject.steps[w.subject.steps.length - 1];
    if (!s) return;
    const key = `${String(s.source.type)}\0${String(s.input.type)}\0${String(s.target.type)}\0${s.output === undefined ? "" : String(s.output.type)}`;
    clearTimeout(this.#cool);
    this.#cool = setTimeout(() => {
      this.#ran = null;
      this.requestUpdate();
    }, 700);
    if (this.#ran !== key) {
      this.#ran = key;
      this.requestUpdate();
    }
  }

  /** The held source, read out of the choice — a press here or anywhere else in the ensemble. */
  #heldQ(): string | null {
    const key = this.w?.focus.look().fixed.find((k) => kindOf(k) === SOURCE);
    return key ? (key.split("\0")[1] ?? null) : null;
  }

  #plan(): Lay {
    const w = this.w!;
    const graph = w.subject.graph;
    if (
      this.#laid === null ||
      this.#laid.graph !== graph ||
      this.#laid.start !== this.start
    )
      this.#laid = { graph, start: this.start, value: lay(graph, this.start) };
    return this.#laid.value;
  }

  /** Take the rule and let the selection go: it named a position the machine has left. */
  #fire(id: RuleId): void {
    const w = this.w!;
    if (w.fire) return w.fire(id);
    take(w.subject, id);
    w.focus.choice.dispatch("drop");
    w.focus.pointer.dispatch("leave");
  }

  override render(): TemplateResult | typeof nothing {
    const w = this.w;
    if (!w) return nothing;
    const l = this.#plan();
    const here = w.subject.at || this.start;
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
    const reach = acting ? new Set(here ? [here] : []) : null;
    const filtering = fixed.length > 0 || over !== null;
    const near = filtering ? new Set<string>() : null;
    if (over !== null) near!.add(over);
    const heldQ = this.#heldQ();
    if (heldQ !== null) near?.add(heldQ);

    // The ends of the named arrows shine like the figure's names — dimmed or not.
    const shine = new Set<string>();
    const looks = l.arcs.map((a) => {
      const can = a.ids.some((id) => canFire(w.subject, id));
      if (can) reach?.add(a.rows[0]!.to);
      const dim = acting && !can;
      const far = !a.rows.some(allowed);
      if (!far) near?.add(a.rows[0]!.from).add(a.rows[0]!.to);
      // Named lights even a dimmed arrow — pointing at its line in the text, at its step in the
      // history — the way the figure runs its bands across dimmed cells.
      const lit = !far && a.rows.some((r) => shows(shown, r));
      if (lit) shine.add(a.rows[0]!.from).add(a.rows[0]!.to);
      return { a, can, dim, far, lit };
    });
    this.#reach = reach;

    const arcs = looks.map(({ a, can, dim, far, lit }) => {
      // One rule names both its halves, the way a text line does; an arrow's rules share all
      // four labels, so its two halves name it exactly.
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
      const told = a.rows.map(edgeLabel).join("\n");
      const cls = classMap({
        arc: true,
        dead: a.dead,
        lit,
        dim,
        far,
        can: acting && can,
        took: idOf(a) === this.#ran,
      });
      const group = svg`<g class=${cls} style=${a.hue}
        @pointerenter=${name} @pointerleave=${leave} @click=${strike}>
        <path class="gap" d=${d}></path>
        <path class="line" d=${d}></path>
        <polygon points=${`${a.x1 - HALF},${lip - dir * TIP} ${a.x1 + HALF},${lip - dir * TIP} ${a.x1},${lip}`}></polygon>
        <title>${told}</title>
      </g>`;
      // The label answers for its arrow: pointing and clicking it is pointing and clicking
      // the arc.
      const capCls = classMap({
        dead: a.dead,
        mute: (dim || far) && !lit,
        can: acting && can,
      });
      const cap = svg`<text class=${capCls} style=${a.hue}
        x=${(a.x0 + a.x1) / 2} y=${dir === 1 ? y - 4 : y + 12}
        @pointerenter=${name} @pointerleave=${leave} @click=${strike}>${a.label}<title>${told}</title></text>`;
      return { group, cap };
    });

    const chips = l.chips.map((c) => {
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
        w.focus.pointer.dispatch("enter", { keys, offer: true, alive: true });
      };
      const press = () => {
        // Running, a press is offered where the step can end — the current state and the
        // fireable arrows' targets; the rest is dimmed and deaf, as on the figure.
        const alive = this.#reach === null || this.#reach.has(c.q);
        w.focus.choice.dispatch("press", {
          key: keyOf(SOURCE, c.q, ""),
          alive,
        });
        name();
        this.requestUpdate();
      };
      const cls = classMap({
        chip: true,
        off: c.off,
        here: here !== "" && c.q === here,
        held: c.q === heldQ,
        lit: shine.has(c.q),
        far: near !== null && !near.has(c.q),
        dim: reach !== null && !reach.has(c.q),
      });
      return svg`<g class=${cls} style=${c.hue}
        @click=${press}
        @pointerenter=${() => {
          this.#over = c.q;
          name();
          this.requestUpdate();
        }}
        @pointerleave=${() => {
          this.#over = null;
          // The hold is in the choice and stays shown; only the pointer's naming goes.
          w.focus.pointer.dispatch("leave");
          this.requestUpdate();
        }}>
        <rect x=${c.x} y=${l.base} width=${c.w} height=${CELL} rx=${ROUND}></rect>
        <text x=${c.x + c.w / 2} y=${l.base + CELL / 2}
          text-anchor="middle" dominant-baseline="central">${c.q}</text>
      </g>`;
    });

    // Arcs first, cells over them, labels over everything: an arrow crossing a label would
    // otherwise strike it through.
    return html`<div class="tag">diagram</div>
      <div class="plot">
        <svg
          class="chart"
          width=${l.width}
          height=${l.height}
          viewBox=${`0 0 ${l.width} ${l.height}`}
        >
          ${arcs.map((a) => a.group)} ${chips}
          <g class="caps">${arcs.map((a) => a.cap)}</g>
        </svg>
      </div>`;
  }
}

if (!customElements.get("fsmjs-diagram"))
  customElements.define("fsmjs-diagram", FsmjsDiagram);

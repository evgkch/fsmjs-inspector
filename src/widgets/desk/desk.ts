/**
 * The desk: one widget that runs the others. It holds an ensemble — a widget enrolled here is
 * wired to the shared subject and focus and redrawn with everyone — and draws the menu: one
 * switch per enrolled widget, in the header's segmented box. The widgets stay where the page put
 * them; a switch turns its widget's `hidden` on and off.
 *
 * Custom element `<fsmjs-desk>`: `wiring = { subject, focus? }`, then `enroll(widget, name?)`.
 * A page that runs its own layout takes `seat(name)` — a switch alone — and reads `panels`.
 */
import { LitElement, html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { TRANSITION } from "@evgkch/fsmjs";
import type { Subject } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { newPanels } from "../../features/show-panels/index.js";
import type { Panels } from "../../features/show-panels/index.js";
import { ensemble } from "../inspector/ensemble.js";
import type { Ensemble, Member } from "../inspector/ensemble.js";
import { sheets } from "../../shared/lib/element.js";
import deskCss from "./ui/desk.css?raw";

export type Wiring = {
  subject: Subject;
  /** Shared with anything else on the page; without one the desk makes its own. */
  focus?: Focus;
};

/** One switch: its word, whether it can be turned, and — when the desk itself shows and hides
 * it — the widget. */
type Seat = {
  name: string;
  locked: boolean;
  title?: string;
  member?: Member & HTMLElement;
};

export class FsmjsDesk extends LitElement {
  static override styles = sheets(deskCss);

  #band: Ensemble | null = null;
  #panels: Panels;
  #seats: Seat[] = [];

  constructor() {
    super();
    this.className = "desk";
    // The menu stands without a subject: a page that runs its own layout only takes seats.
    // The machine and the element live and die together; nothing to unsubscribe.
    this.#panels = newPanels([]);
    this.#panels.rx.on(TRANSITION, () => {
      this.#apply();
      this.requestUpdate();
    });
  }

  set wiring(w: Wiring) {
    // Rewired: the old ensemble belonged to the old subject.
    this.#band?.destroy();
    this.#band = ensemble(w.subject, {}, { focus: w.focus });
  }

  /** The binder behind the menu: `fire`, `rewind`, `forget`, `draw` for the page's own use. */
  get ensemble(): Ensemble {
    return this.#band!;
  }

  /** Which widgets are up — for a page that lays panels out itself. */
  get panels(): Panels {
    return this.#panels;
  }

  /**
   * A switch alone, for a panel the page shows and hides itself — its state is read off
   * `panels`. A locked seat is shown as it stands and takes no click.
   */
  seat(name: string, opts: { locked?: boolean; title?: string } = {}): void {
    this.#seats.push({ name, locked: opts.locked ?? false, title: opts.title });
    this.requestUpdate();
  }

  /**
   * Wire the widget, draw it, and give it a switch that shows and hides it. The name defaults
   * to the tag without the `fsmjs-` prefix; several widgets of one tag — three legends — are
   * named by the caller.
   */
  enroll(member: Member & HTMLElement, name?: string): void {
    const band = this.#band;
    if (!band) return;
    const word = name ?? member.tagName.toLowerCase().replace(/^fsmjs-/, "");
    band.enroll(member);
    this.#seats.push({ name: word, locked: false, member });
    this.requestUpdate();
  }

  /** What the panels machine says, worn: absent from the context is up. */
  #apply(): void {
    const up = this.#panels.state.context;
    for (const seat of this.#seats)
      if (seat.member) seat.member.hidden = up[seat.name] === false;
  }

  override render(): TemplateResult {
    const up = this.#panels.state.context;
    return html`<div class="switches">
      ${this.#seats.map(
        (seat) =>
          html`<label title=${seat.title ?? nothing}>
            <input
              type="checkbox"
              .checked=${up[seat.name] !== false}
              ?disabled=${seat.locked}
              @change=${(e: Event) =>
                this.#panels.dispatch("put", {
                  panel: seat.name,
                  up: (e.target as HTMLInputElement).checked,
                })}
            />
            <span>${seat.name}</span>
          </label>`,
      )}
    </div>`;
  }
}

if (!customElements.get("fsmjs-desk"))
  customElements.define("fsmjs-desk", FsmjsDesk);

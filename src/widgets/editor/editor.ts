/**
 * The schema as text, in the rule language.
 *
 * Three layers: a `pre` with the same characters coloured, a transparent textarea over it for the
 * caret, and a gutter with line numbers and fire marks. The two text layers must share every
 * metric (font, padding, line height) or the caret drifts; the stylesheet sets them in one rule.
 *
 * The join to the figure is the line number a rule was read on: pointing at a cell lights the
 * lines (same `shows` predicate), pointing at a line lights the figure (same pointer machine),
 * clicking the mark takes the rule (same take path).
 *
 * Writing aids: the word being typed is completed in grey where only one word fits (TAB takes
 * it), and a double-clicked name can be renamed in every line at once.
 *
 * Custom element `<fsmjs-editor>`, a LitElement for its shadow, styles and lifecycle — and an
 * imperative text engine inside: the textarea, the `insertText` writes that keep the browser's
 * undo stack, the caret and the completion ghost are managed by hand, and the one render places
 * the nodes the constructor built. `disconnectedCallback` unsubscribes from the focus and
 * writing machines.
 */
import { LitElement, html } from "lit";
import type { TemplateResult } from "lit";
import { TRANSITION } from "@evgkch/fsmjs";
import type { Off } from "@evgkch/fsmjs";
import { halvesOf, shows } from "../../entities/cell/index.js";
import { ruleId } from "../../entities/machine/index.js";
import type { Flaws, Lane } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { newWriting } from "../../features/write-rules/index.js";
import type { Facts, Typing } from "../../features/write-rules/index.js";
import { make, word } from "../../shared/lib/dom.js";
import { CELL, rhythm } from "../../shared/lib/grid.js";
import { sheets } from "../../shared/lib/element.js";
import type { Vocab } from "../../shared/lang/complete.js";
import type { Written } from "../../shared/lang/rules.js";
import { tokenize } from "../../shared/lang/tokens.js";
import editorCss from "./ui/editor.css?raw";

export type Wiring = {
  focus: Focus;
  /**
   * Read-only: same colours and highlighting, but no typing, completion, renaming, or firing by
   * line — for a machine running in another process, whose schema cannot be edited from here.
   */
  readonly?: boolean;
  /** The text changed. Reading it is somebody else's business, and slower. */
  onEdit: () => void;
  /** Could this rule fire from where the machine stands. */
  fires: (rule: Written) => boolean;
  /** Where it stands, if it stands anywhere. */
  here: () => string;
  /** Take it. */
  fire: (rule: Written) => void;
};

export class FsmjsEditor extends LitElement {
  static override styles = sheets(editorCss);

  #w?: Wiring;

  #area: HTMLTextAreaElement;
  #code: HTMLElement;
  #ink: HTMLPreElement;
  #ghost: HTMLSpanElement;
  #gutter: HTMLDivElement;
  #sheet: HTMLDivElement;
  #chip: HTMLButtonElement;
  #say: HTMLParagraphElement;
  #tag: HTMLDivElement;

  /** What is going on in the text besides the text. */
  #writing = newWriting();
  #off: Off[] = [];

  /** Where every rule is written, by line. A line holds at most one rule; most hold none. */
  #written = new Map<number, Written>();
  #colour: Lane = () => undefined;
  #blamed: number | null = null;
  /** What the strip at the foot has to choose between: a complaint, and the size of the thing. */
  #wrong: string | null = null;
  #counts = "";
  /** What `analyze` and `validate` make of the schema this text was read as. */
  #bad: Flaws | null = null;

  /** The names the text has already used, by kind — what completion offers. */
  #vocab: Vocab = {};

  /** Whether the text is being changed from in here, so that one edit is not read as two. */
  #ours = false;

  /**
   * The text the current rules were read from. While the on-screen text differs (mid-edit), the
   * line map is stale, so gutter marks and highlighting say nothing until the reader catches up.
   */
  #read = "";

  /** One row of the gutter and one line of the ink, by line number. */
  #rows = new Map<number, HTMLElement>();
  #lines = new Map<number, HTMLElement>();

  /** Which line the pointer is on, over the number and over the text alike. */
  #over = 0;

  /** Set by `filled`: the key the machine consumed must not also act in the browser. */
  #swallowed = false;

  constructor() {
    super();
    this.className = "editor";

    this.#area = make("textarea", "");
    // Read-only, not disabled: caret, selection, copying and the panel's keys still work.
    this.#area.spellcheck = false;
    this.#area.autocapitalize = "off";
    this.#area.autocomplete = "off";
    this.#area.wrap = "off";
    this.#area.setAttribute("aria-label", "Schema, as rules");

    this.#code = make("code", "");
    this.#ink = make("pre", "ink");
    this.#ink.setAttribute("aria-hidden", "true");
    this.#ink.append(this.#code);

    /** What the word being typed would be, shown where it would go. */
    this.#ghost = make("span", "ghost");
    this.#ghost.setAttribute("aria-hidden", "true");

    this.#gutter = make("div", "gutter");
    const stack = make("div", "stack");
    stack.append(this.#ink, this.#area);
    // One scrollport over text and gutter both; the gutter sticks left instead of being synced.
    const page = make("div", "page");
    page.append(this.#gutter, stack);
    this.#sheet = make("div", "sheet");
    this.#sheet.append(page);

    /** Rename this word everywhere. Hidden until a word has been named by a double-click. */
    this.#chip = make("button", "rename");
    this.#chip.type = "button";
    this.#chip.hidden = true;
    this.#tag = make("div", "tag");
    this.#tag.append(make("span", "what", "code"), this.#chip);

    // One strip at the foot: the parser's complaint while there is one, the counts otherwise,
    // never both. Always present, so the page does not move on unparsed keystrokes.
    this.#say = make("p", "say");
    // A line here is a rule, and a rule is a row of the figure: one height, from one place.
    rhythm(this);
  }

  /** One render, placing the nodes the constructor built; the engine mutates them in place. */
  override render(): TemplateResult {
    return html`${this.#tag}${this.#sheet}${this.#say}`;
  }

  set wiring(w: Wiring) {
    if (this.#w) this.#stop();
    this.#w = w;
    this.#area.readOnly = w.readonly ?? false;

    this.#sheet.addEventListener("mousemove", (e) => this.#pointing(e.clientY));
    this.#sheet.addEventListener("mouseleave", () => {
      this.#over = 0;
      w.focus.pointer.dispatch("leave");
    });

    // Events are handed to the writing machine as they come; what each means is the schema's.
    // Skipped when read-only: these feed renaming, and there is nothing to rename.
    if (!w.readonly)
      for (const kind of ["mousedown", "dblclick", "blur"] as const)
        this.#area.addEventListener(kind, (e) => this.#tell(kind, e));

    // On input: recolour now, notify the (slower) reader.
    this.#area.addEventListener("input", (e) => {
      if (this.#ours) return;
      this.#tell("input", e);
      this.#paint();
      w.onEdit();
    });

    // Three DOM events, one fact: the caret may have moved.
    for (const kind of ["keyup", "click", "focus"] as const)
      this.#area.addEventListener(kind, (e) => this.#tell("moved", e));

    this.#area.addEventListener("keydown", (e) => {
      if (w.readonly) return;
      this.#swallowed = false;
      this.#tell("keydown", e);
      if (this.#swallowed) e.preventDefault();
    });

    this.#chip.addEventListener("click", () => this.#tell("press"));

    this.#off = [
      w.focus.choice.rx.on(TRANSITION, () => this.#dress()),
      w.focus.pointer.rx.on(TRANSITION, () => this.#dress()),
      this.#writing.rx.on(TRANSITION, () => {
        this.#ghostly();
        this.#badge();
      }),
      // The three edits the machine asks for arrive finished. Deferred with `queueMicrotask`:
      // they fire mid-dispatch and end in another dispatch, which the library forbids nesting.
      this.#writing.rx.on("armed", ({ from, to }) =>
        queueMicrotask(() => {
          this.#area.focus();
          this.#area.setSelectionRange(from, to);
        }),
      ),
      this.#writing.rx.on("filled", ({ from, to, text }) => {
        this.#swallowed = true;
        queueMicrotask(() => this.#write(from, to, text));
      }),
      this.#writing.rx.on("rewritten", ({ text, caret }) =>
        queueMicrotask(() => this.#patch(text, caret)),
      ),
    ];
  }

  get wiring(): Wiring {
    return this.#w!;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stop();
  }

  #stop(): void {
    for (const it of this.#off) it();
    this.#off = [];
  }

  #fresh(): boolean {
    return this.#area.value === this.#read;
  }

  /**
   * The text, coloured, and the gutter beside it. Both are built line by line from the same split,
   * so a row of one is always the row of the other.
   */
  #paint(): void {
    const source = this.#area.value.split("\n");
    // The textarea is sized by these so it never scrolls itself — the sheet does.
    this.style.setProperty("--lines", String(source.length));
    this.style.setProperty(
      "--cols",
      String(Math.max(0, ...source.map((line) => line.length))),
    );
    this.#rows.clear();
    this.#lines.clear();

    this.#code.replaceChildren(
      ...source.map((text, i) => {
        const line = make("span", "line");
        for (const t of tokenize(text))
          line.append(
            t.ink
              ? word(
                  t.text,
                  t.ink === "q" ? `q${this.#stranded(t.text)}` : t.ink,
                  t.ink === "q" ? this.#colour(t.text) : undefined,
                )
              : document.createTextNode(t.text),
          );
        this.#lines.set(i + 1, line);
        return line;
      }),
    );

    this.#gutter.replaceChildren(
      ...source.map((_, i) => {
        const at = i + 1;
        const row = make("div", "row");
        // The mark on the outside edge, then the number; the mark column is always present.
        row.append(make("span", "run"), make("span", "num", String(at)));
        this.#rows.set(at, row);
        this.#wire(at, row);
        return row;
      }),
    );

    this.#mark();
    this.#dress();
    this.#ghostly();
    this.#say.textContent = this.#wrong ?? this.#counts;
    this.#say.classList.toggle("wrong", this.#wrong !== null);
  }

  /**
   * The flaws of a state, as classes on the word — the same facts the figure draws on its index,
   * so both strike the word through or neither does.
   */
  #stranded(name: string): string {
    if (!this.#bad) return "";
    return `${this.#bad.off.has(name) ? " off" : ""}${this.#bad.ends.has(name) ? " end" : ""}`;
  }

  /** Pressing a gutter row takes the rule on that line — a line names one outright. */
  #wire(at: number, row: HTMLElement): void {
    if (this.#w!.readonly) return;
    row.addEventListener("click", () => {
      const rule = this.#fresh() ? this.#written.get(at) : undefined;
      if (rule && this.#w!.fires(rule)) this.#w!.fire(rule);
    });
  }

  /**
   * Which line the pointer is on — arithmetic, not a hit test: every line is one module tall and
   * cannot wrap. One source for the number and the text, so both light together.
   */
  #pointing(y: number): void {
    const w = this.#w!;
    const box = this.#code.getBoundingClientRect();
    const at = Math.floor((y - box.top) / CELL) + 1;
    const on = at >= 1 && at <= this.#lines.size ? at : 0;
    if (on === this.#over) return;
    this.#over = on;
    const rule = on && this.#fresh() ? this.#written.get(on) : undefined;
    // A line names both halves of its rule; a line with no rule names no cells, and the pointer
    // machine has a guard for that.
    w.focus.pointer.dispatch("enter", {
      keys: rule ? halvesOf(rule.edge) : [],
      offer: true,
      alive: true,
    });
  }

  /**
   * Where the machine stands, in the text: a dot on every line whose rule leaves the current
   * state, in that state's lane colour — the same mark the figure draws on its index.
   */
  #mark(): void {
    const w = this.#w!;
    const ok = this.#fresh();
    // Also marked on the state's own word: a terminal state has no leaving lines to mark.
    const here = w.here();
    for (const [, line] of this.#lines)
      for (const q of line.querySelectorAll(".q"))
        q.classList.toggle("here", here !== "" && q.textContent === here);
    for (const [at, row] of this.#rows) {
      const rule = ok ? this.#written.get(at) : undefined;
      const can = rule !== undefined && w.fires(rule);
      // A rule that can never fire: unreachable source, or shadowed by an unguarded rule.
      const gone =
        rule !== undefined &&
        (this.#bad?.dead(ruleId(rule.edge.from, rule.edge.on, rule.slot)) ??
          false);
      row.classList.toggle("can", can);
      row.classList.toggle("rule", rule !== undefined);
      row.classList.toggle("dead", gone);
      this.#lines.get(at)?.classList.toggle("dead", gone);
      row.classList.toggle("blame", at === this.#blamed);
      if (can) row.setAttribute("style", this.#colour(rule.edge.from) ?? "");
      else row.removeAttribute("style");
      row.title = can
        ? "take this rule"
        : gone
          ? "this rule can never fire: nothing reaches the state it leaves, or a rule ahead of it in the same cell always wins"
          : "";
    }
  }

  /**
   * What the figure is about, said of the text — the same `shows` of the same cells. A line and
   * its number wear the highlight together.
   */
  #dress(): void {
    const w = this.#w!;
    const { shown } = w.focus.look();
    const ok = this.#fresh();
    for (const [at, line] of this.#lines) {
      const rule = ok ? this.#written.get(at) : undefined;
      const on = rule !== undefined && shows(shown, rule.edge);
      line.classList.toggle("lit", on);
      this.#rows.get(at)?.classList.toggle("lit", on);
    }
  }

  // ── what the machine is told ────────────────────────────────────────────────

  /**
   * The facts as the DOM has them: key, clicks, text, caret. What they mean is the writing
   * machine's schema to decide.
   */
  #facts(e?: Event): Facts {
    return {
      key: e && "key" in e ? String((e as KeyboardEvent).key) : "",
      clicks:
        e instanceof this.#area.ownerDocument.defaultView!.MouseEvent
          ? e.detail
          : 0,
      text: this.#area.value,
      caret: this.#area.selectionStart,
      end: this.#area.selectionEnd,
      vocab: this.#vocab,
    };
  }

  #tell(kind: Exclude<keyof Typing, "drop">, e?: Event): boolean {
    // `write` finishes what it started, and its own `input` is not a keystroke.
    return this.#ours ? false : this.#writing.dispatch(kind, this.#facts(e));
  }

  /** The offer, drawn. Called when it changes, and again whenever the layer is rebuilt under it. */
  #ghostly(): void {
    this.#ghost.remove();
    const at = this.#writing.state;
    if (at.type !== "ahead") return;
    this.#ghost.textContent = at.context.rest;
    this.#lines.get(at.context.line)?.append(this.#ghost);
  }

  /** Write into the text via `insertText`, keeping the browser's undo stack. */
  #write(from: number, to: number, text: string, caret?: number): void {
    this.#ours = true;
    try {
      this.#area.setSelectionRange(from, to);
      if (!document.execCommand?.("insertText", false, text))
        this.#area.setRangeText(text, from, to, "end");
      if (caret !== undefined) this.#area.setSelectionRange(caret, caret);
    } finally {
      this.#ours = false;
    }
    this.#paint();
    // The caret is somewhere new, so what is on offer is a new question.
    this.#tell("moved");
    this.#w!.onEdit();
  }

  /** The same text, changed in the one stretch where it differs. */
  #patch(text: string, caret: number): void {
    const was = this.#area.value;
    if (was === text) return void this.#area.setSelectionRange(caret, caret);
    let a = 0;
    while (a < was.length && a < text.length && was[a] === text[a]) a++;
    let b = 0;
    while (
      b < was.length - a &&
      b < text.length - a &&
      was[was.length - 1 - b] === text[text.length - 1 - b]
    )
      b++;
    this.#write(a, was.length - b, text.slice(a, text.length - b), caret);
  }

  // ── renaming a name in every line it stands in ──────────────────────────────

  /** The rename chip. Hidden when read-only — renaming is the one thing it offers. */
  #badge(): void {
    const at = this.#writing.state;
    if (this.#w!.readonly || (at.type !== "picked" && at.type !== "renaming"))
      return void (this.#chip.hidden = true);
    this.#chip.hidden = false;
    const on = at.type === "renaming";
    const name = at.context.word;
    this.#chip.classList.toggle("on", on);
    this.#chip.textContent = on ? `renaming ${name}` : `rename ${name}`;
    this.#chip.title = on
      ? "type the new name — every line follows. Esc to stop"
      : `retype ${name} in every line it is written on`;
  }

  // ── the surface a page touches ──────────────────────────────────────────────

  /** The text as it stands, for whatever reads it. */
  text(): string {
    return this.#area.value;
  }

  /** Put a schema in it, as text. */
  set(text: string): void {
    this.#area.value = text;
    this.#writing.dispatch("drop");
    this.#paint();
  }

  /**
   * What the last reading found: where every rule is written, the colour of every state, and what
   * is wrong with the schema — which is drawn on the words and the lines it is wrong about.
   */
  show(rules: readonly Written[], colour: Lane, facts: Flaws): void {
    this.#written = new Map(rules.map((r) => [r.at, r]));
    this.#colour = colour;
    this.#bad = facts;
    this.#read = this.#area.value;
    // The size, then only what is wrong with it.
    const many = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
    this.#counts = [
      many(facts.all.length, "state"),
      many(facts.rules, "rule"),
      ...(facts.off.size ? [`${facts.off.size} nothing reaches`] : []),
      ...(facts.ends.size ? [`${facts.ends.size} nothing leaves`] : []),
    ].join(" · ");
    this.#wrong = null;
    // Completion vocabulary: only names the text already uses, by kind.
    const q = new Set<string>();
    const s = new Set<string>();
    const l = new Set<string>();
    const op = new Set<string>();
    for (const { edge } of rules) {
      q.add(edge.from);
      q.add(edge.to);
      s.add(edge.on);
      if (edge.emit) l.add(edge.emit);
      // A row carries names or nothing.
      for (const f of [edge.when, edge.with, edge.by])
        if (f !== undefined) op.add(f);
    }
    const sorted = (set: Set<string>) => [...set].sort();
    this.#vocab = { q: sorted(q), s: sorted(s), l: sorted(l), op: sorted(op) };
    this.#paint();
  }

  /** Which lines could fire from where the machine now stands. */
  mark(): void {
    this.#mark();
  }

  /** The parser's complaint and its line, shown in the editor's own foot strip. */
  blame(message: string | null, line: number | null): void {
    this.#blamed = line;
    this.#wrong = message;
    this.#say.textContent = this.#wrong ?? this.#counts;
    this.#say.classList.toggle("wrong", this.#wrong !== null);
    this.#mark();
  }
}

if (!customElements.get("fsmjs-editor"))
  customElements.define("fsmjs-editor", FsmjsEditor);

/**
 * The schema, written in the language the machine is written in — and the other end of the
 * figure.
 *
 * Three layers, and they are three because a textarea can only ever be one of them. Underneath, a
 * `pre` with the same characters in it, coloured: the textarea's own glyphs are made transparent,
 * so what you see is the colour and what you move is the caret. Beside them, a gutter — a row per
 * line, carrying the number the parser counts in and, where a rule can fire from where the machine
 * stands, the mark that says so. Every metric the two text layers share has to hold for both at
 * once — the same font, the same padding, the same line height — or the caret drifts off the word
 * it is on, so they are set together in one rule in the stylesheet.
 *
 * What makes it a debugger rather than a text box is the join, and the join is one number: the
 * line a rule was read on. With it,
 *
 *   — pointing at a cell of the figure lights the lines of the rules that cell holds, because the
 *     editor asks the same `shows` of its lines that the figure asks of its cells;
 *   — pointing at a line lights the figure, because the gutter dispatches the same `enter` the
 *     figure's own cells do, into the same pointer machine;
 *   — and clicking the mark takes the rule, through the same door the figure's two presses use.
 *
 * None of those three is a rule of its own. Each is a surface handing the one machine the one
 * event, which is why they cannot disagree about what is being looked at.
 *
 * Two things here are about writing rather than reading, and both are the same idea: the tool knows
 * the language and the schema, so it should not make you retype either. The word being typed is
 * finished in grey where only one word could be meant, and TAB takes it. And a name double-clicked
 * can be retyped in every line it stands in at once, because a text with no declarations has no
 * other way of saying that twelve `locked`s are one state.
 *
 * It is a custom element — `<fsmjs-editor>` — and the element *is* the `.editor` frame: light DOM,
 * so a page can drop one into its own source pane. Leaving the page calls `stop`, because the
 * subscriptions it holds to the focus and the writing machine outlive it otherwise.
 */
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
import type { Vocab } from "../../shared/lang/complete.js";
import type { Written } from "../../shared/lang/rules.js";
import { tokenize } from "../../shared/lang/tokens.js";
import "./ui/editor.css";

export type Wiring = {
  focus: Focus;
  /**
   * The source is read and not written.
   *
   * The same schema, the same colours, the same marks in the gutter, the same line lighting up
   * when the pointer is on a cell of the figure — and nothing that would change it: no typing, no
   * completion, no renaming, and no firing a rule by pressing its line. It is for a machine that
   * is running somewhere else, where the text on screen is a report of a schema that is compiled
   * into somebody's application and cannot be edited from here by any means at all. A textarea
   * that accepts a keystroke and loses it is worse than one that refuses it.
   */
  readonly?: boolean;
  /** The text changed. Reading it is somebody else's business, and slower. */
  onEdit: () => void;
  /** Could this rule fire from where the machine stands. */
  fires: (rule: Written) => boolean;
  /** Where it stands, if it stands anywhere: exploring, no state is current. */
  here: () => string;
  /** Take it. */
  fire: (rule: Written) => void;
};

export class FsmjsEditor extends HTMLElement {
  #w?: Wiring;

  #area: HTMLTextAreaElement;
  #code: HTMLElement;
  #ink: HTMLPreElement;
  #ghost: HTMLSpanElement;
  #gutter: HTMLDivElement;
  #sheet: HTMLDivElement;
  #chip: HTMLButtonElement;
  #say: HTMLParagraphElement;

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
   * The text those lines were read from.
   *
   * Everything the gutter says is about the machine, and the machine was built from the text as
   * it was last read — which is not the text on screen while you are typing into it. Insert one
   * line at the top and every rule is one line further down than the map says: the marks point at
   * the wrong rules, and pointing at a cell lights the wrong lines. So they say nothing at all
   * until the reader has caught up, which it does a moment after you stop.
   */
  #read = "";

  /** One row of the gutter and one line of the ink, by line number. */
  #rows = new Map<number, HTMLElement>();
  #lines = new Map<number, HTMLElement>();

  /** Which line the pointer is on, over the number and over the text alike. */
  #over = 0;

  /**
   * Set by `filled`, which is the only edit a keystroke can ask for. The key the machine consumed
   * must not also do what the browser would do with it — and which key that was is not asked here.
   */
  #swallowed = false;

  constructor() {
    super();
    this.className = "editor";

    this.#area = make("textarea", "");
    // Read-only, not disabled: the caret still goes in, the text still selects and copies, and the
    // keys the panel uses to walk the run still arrive. What is refused is changing it.
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
    /**
     * One scrollport over the whole text, gutter included.
     *
     * The gutter used to be beside the scroll and moved to match it, which meant the wheel did
     * nothing over the numbers — a strip down the side of a source where scrolling is not scrolling.
     * Inside, it scrolls because it is on the page that scrolls, and stays put across it by sticking
     * to the left. One less thing kept in step by hand.
     */
    const page = make("div", "page");
    page.append(this.#gutter, stack);
    this.#sheet = make("div", "sheet");
    this.#sheet.append(page);

    /** Rename this word everywhere. Hidden until a word has been named by a double-click. */
    this.#chip = make("button", "rename");
    this.#chip.type = "button";
    this.#chip.hidden = true;
    const tag = make("div", "tag");
    tag.append(make("span", "what", "code"), this.#chip);

    /**
     * One strip at the foot, and one thing said in it.
     *
     * It was two — the reader's complaint, and the size of the schema with whatever is wrong with
     * it — and they cannot both be true at once. While the text does not parse, the counts are about
     * a schema that is no longer on the screen: the last one that read. Stacking a stale caption
     * under a live complaint is saying two things where one of them is quietly false, and it draws
     * two rules across the foot of a box that has one foot.
     *
     * So: the complaint while there is one, the counts when there is not, in the same place, in the
     * same type, never both. It is never hidden either, which is the whole reason it lives inside
     * the frame: a strip that comes and goes moves the page on every keystroke that does not parse,
     * and that is most of the keystrokes in a rule.
     */
    this.#say = make("p", "say");
    this.append(tag, this.#sheet, this.#say);
    // A line here is a rule, and a rule is a row of the figure: one height, from one place.
    rhythm(this);
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

    /**
     * Every event the box has, handed over as it comes.
     *
     * There is no `if` here on purpose. Which of these means anything, and what — that Escape lets a
     * word go, that one click is not two, that TAB finishes a word only where one is on offer — is
     * written once, in the schema, where it can be read in one place and dumped as a graph like
     * everything else this tool draws.
     */
    // Not where the source cannot be written: every one of these is the writing machine being told
    // about a word somebody might rename, and there is nothing to rename.
    if (!w.readonly)
      for (const kind of ["mousedown", "dblclick", "blur"] as const)
        this.#area.addEventListener(kind, (e) => this.#tell(kind, e));

    // The text changed, and two things always follow whatever it meant: the colour is redrawn now,
    // and the reader is set going, which is slower and worth waiting a moment for.
    this.#area.addEventListener("input", (e) => {
      if (this.#ours) return;
      this.#tell("input", e);
      this.#paint();
      w.onEdit();
    });

    // Three events of the DOM and one fact: the caret may have moved.
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
      // One machine, so one redraw: the ghost and the chip are two faces of the same state.
      this.#writing.rx.on(TRANSITION, () => {
        this.#ghostly();
        this.#badge();
      }),
      // The three edits the machine asks for. Each is worked out from what it holds and arrives
      // finished; nothing here knows which state asked, or why.
      //
      // After the transition and not inside it: these arrive while the machine is still
      // dispatching, and every one of them ends in a `see` — the caret has moved, so what is on
      // offer is a new question. The library forbids nesting dispatches, and is right to.
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

  disconnectedCallback(): void {
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
    // What the textarea is sized by: it must not scroll, so that the sheet can. Counted here
    // because this is where the text is already being counted; turned into a height and a width
    // in the stylesheet, in the units the layer behind it is set in.
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
        // The mark first, then the number. Where a debugger puts what you press is the outside
        // edge — nothing is nearer the hand, and nothing else in the column moves when one
        // appears, because the column is always there.
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
   * What is true of a state, written on the state — the same two facts the figure draws on its own
   * index, so the word is struck through in both places or in neither. Nothing is listed anywhere:
   * a list of names beside a text full of those names is a lookup table for what you are looking
   * at, and three of its four rows were about single words in it.
   */
  #stranded(name: string): string {
    if (!this.#bad) return "";
    return `${this.#bad.off.has(name) ? " off" : ""}${this.#bad.ends.has(name) ? " end" : ""}`;
  }

  /**
   * A row of the gutter is the rule on that line, and pressing it takes that rule — a line names
   * one outright, so it needs no second click the way the figure's two halves do.
   */
  #wire(at: number, row: HTMLElement): void {
    if (this.#w!.readonly) return;
    row.addEventListener("click", () => {
      const rule = this.#fresh() ? this.#written.get(at) : undefined;
      if (rule && this.#w!.fires(rule)) this.#w!.fire(rule);
    });
  }

  /**
   * Which line the pointer is on, over the number and over the text alike.
   *
   * One source for both, because they are one row: the number and the line it is against are the
   * same rule, and a hover that lights one of them is a band with a break in it. The gutter is on
   * the page that scrolls, so the page is where this is asked — and the answer is arithmetic
   * rather than a hit test, because every line is exactly one module tall and cannot wrap.
   */
  #pointing(y: number): void {
    const w = this.#w!;
    const box = this.#code.getBoundingClientRect();
    const at = Math.floor((y - box.top) / CELL) + 1;
    const on = at >= 1 && at <= this.#lines.size ? at : 0;
    if (on === this.#over) return;
    this.#over = on;
    const rule = on && this.#fresh() ? this.#written.get(on) : undefined;
    // Both halves: the line says where the rule starts and where it ends, so the figure says both
    // too — two bands out of block 1 and two out of block 3, crossing at the corner. A line with
    // no rule on it names no cells, which is a fact and not a reason to say nothing: the pointer
    // machine has one guard for naming nothing, and it is the guard the figure's out-of-reach
    // cells meet as well.
    w.focus.pointer.dispatch("enter", {
      keys: rule ? halvesOf(rule.edge) : [],
      offer: true,
      alive: true,
    });
  }

  /**
   * Where the machine stands, said in the text: a dot on every line whose rule goes out of the
   * state it is standing in, in that state's own colour.
   *
   * It is the figure's mark and not a second one. The figure puts a dot on the row of the state
   * the machine is in; these are the same dot, on the same fact, in the same lane colour — the
   * lines you are looking at are the ones that dot is about. That they are also the lines you can
   * click to take a step is not a second meaning: it is what standing somewhere affords.
   */
  #mark(): void {
    const w = this.#w!;
    const ok = this.#fresh();
    // Where the machine stands, said on the state itself and not only on the lines that leave it.
    // A state with nothing leaving it has no marked line at all, and a run that ends there would
    // otherwise leave the source saying nothing about where it ended.
    const here = w.here();
    for (const [, line] of this.#lines)
      for (const q of line.querySelectorAll(".q"))
        q.classList.toggle("here", here !== "" && q.textContent === here);
    for (const [at, row] of this.#rows) {
      const rule = ok ? this.#written.get(at) : undefined;
      const can = rule !== undefined && w.fires(rule);
      // A rule that can never fire, whatever you do: nothing reaches the state it leaves, or an
      // unguarded rule ahead of it in its cell always wins. The gutter is where a debugger says
      // that, on the line it is about.
      const gone =
        rule !== undefined &&
        (this.#bad?.dead(ruleId(rule.edge.from, rule.edge.on, rule.slot)) ??
          false);
      row.classList.toggle("can", can);
      row.classList.toggle("rule", rule !== undefined);
      row.classList.toggle("dead", gone);
      // Dead text reads as dead text, which is what every debugger does with a line that cannot
      // run. The gutter says which fault it is; the line says not to spend time on it.
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
   * What the figure is about, said of the text: the same question, asked of the same cells.
   *
   * A line and its number are one row of one thing, so both wear it. The band then runs from the
   * outside edge of the panel to the end of the text without a break in it — a highlight that
   * starts after the gutter says the number is not part of the line, and the whole join this tool
   * is built on is that it is.
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
   * The facts, as the DOM has them at the moment something happened. This is the whole of what
   * the machine is handed: which key, how many clicks, what the text reads, where the caret is.
   * Nothing here decides what any of it means — that is the schema's, and keeping it there is the
   * difference between a machine and a handler that dispatches the conclusion it already drew.
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

  /**
   * Write into the text, keeping the browser's own undo where the browser will have it. Assigning
   * to `value` throws that stack away, and an editor you cannot undo in is not an editor.
   */
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

  /**
   * What the chip says, which is the whole of the mode's face — and it says nothing at all where
   * the source cannot be written, because renaming is the one thing it offers.
   */
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
    // How big it is, and then only what is wrong. A schema with nothing to report says its two
    // numbers and stops, which is how you can tell at a glance that there is nothing to report.
    const many = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
    this.#counts = [
      many(facts.all.length, "state"),
      many(facts.rules, "rule"),
      ...(facts.off.size ? [`${facts.off.size} nothing reaches`] : []),
      ...(facts.ends.size ? [`${facts.ends.size} nothing leaves`] : []),
    ].join(" · ");
    this.#wrong = null;
    // What the text has taught: every name it uses, by kind. Nothing is invented here — a
    // completion that offers a state the schema has never mentioned is a suggestion to write a
    // state nothing reaches.
    const q = new Set<string>();
    const s = new Set<string>();
    const l = new Set<string>();
    const op = new Set<string>();
    for (const { edge } of rules) {
      q.add(edge.from);
      q.add(edge.to);
      s.add(edge.on);
      if (edge.emit) l.add(edge.emit);
      // A rule read from text carries names; one read off a live machine carries the functions
      // themselves, and a function has no name worth offering.
      for (const f of [edge.when, edge.with, edge.by])
        if (typeof f === "string") op.add(f);
    }
    const sorted = (set: Set<string>) => [...set].sort();
    this.#vocab = { q: sorted(q), s: sorted(s), l: sorted(l), op: sorted(op) };
    this.#paint();
  }

  /** Which lines could fire from where the machine now stands. */
  mark(): void {
    this.#mark();
  }

  /**
   * What the reader would not read, and which line it is about. It is shown inside the editor's
   * own frame: a message that appears between the editor and whatever is under it moves the page
   * on every keystroke that does not parse, which is most of them while a rule is being typed.
   */
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

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
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { Off } from "@evgkch/fsmjs";
import { halvesOf, shows } from "../../entities/cell/index.js";
import type { Lane } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { newWriting, spread } from "../../features/write-rules/index.js";
import type { Offer } from "../../features/write-rules/index.js";
import { make, word } from "../../shared/lib/dom.js";
import { ahead } from "../../shared/lang/complete.js";
import type { Vocab } from "../../shared/lang/complete.js";
import type { Written } from "../../shared/lang/rules.js";
import { tokenize } from "../../shared/lang/tokens.js";
import "./ui/editor.css";

export type Editor = {
  readonly node: HTMLElement;
  readonly text: () => string;
  /** Put a schema in it, as text. */
  readonly set: (text: string) => void;
  /** What the last reading found: where every rule is written, and the colour of every state. */
  readonly show: (rules: readonly Written[], colour: Lane) => void;
  /** Which lines could fire from where the machine now stands. */
  readonly mark: () => void;
  /**
   * What the reader would not read, and which line it is about. It is shown inside the editor's
   * own frame: a message that appears between the editor and whatever is under it moves the page
   * on every keystroke that does not parse, which is most of them while a rule is being typed.
   */
  readonly blame: (message: string | null, line: number | null) => void;
  readonly stop: () => void;
};

export type Wiring = {
  focus: Focus;
  /** The text changed. Reading it is somebody else's business, and slower. */
  onEdit: () => void;
  /** Could this rule fire from where the machine stands. */
  fires: (rule: Written) => boolean;
  /** Take it. */
  fire: (rule: Written) => void;
};

export function newEditor(w: Wiring): Editor {
  const area = make("textarea", "");
  area.spellcheck = false;
  area.autocapitalize = "off";
  area.autocomplete = "off";
  area.wrap = "off";
  area.setAttribute("aria-label", "Schema, as rules");

  const code = make("code", "");
  const ink = make("pre", "ink");
  ink.setAttribute("aria-hidden", "true");
  ink.append(code);

  /** What the word being typed would be, shown where it would go. */
  const ghost = make("span", "ghost");
  ghost.setAttribute("aria-hidden", "true");

  const gutter = make("div", "gutter");
  const stack = make("div", "stack");
  stack.append(ink, area);
  /**
   * One scrollport over the whole text, gutter included.
   *
   * The gutter used to be beside the scroll and moved to match it, which meant the wheel did
   * nothing over the numbers — a strip down the side of a source where scrolling is not scrolling.
   * Inside, it scrolls because it is on the page that scrolls, and stays put across it by sticking
   * to the left. One less thing kept in step by hand.
   */
  const page = make("div", "page");
  page.append(gutter, stack);
  const sheet = make("div", "sheet");
  sheet.append(page);

  /** Rename this word everywhere. Hidden until a word has been named by a double-click. */
  const chip = make("button", "rename");
  chip.type = "button";
  chip.hidden = true;
  const tag = make("div", "tag");
  tag.append(make("span", "what", "code"), chip);

  const note = make("p", "note");
  note.hidden = true;
  const node = make("div", "editor");
  node.append(tag, sheet, note);

  /** Where every rule is written, by line. A line holds at most one rule; most hold none. */
  let written = new Map<number, Written>();
  let colour: Lane = () => undefined;
  let blamed: number | null = null;

  /** The names the text has already used, by kind — what completion offers. */
  let vocab: Vocab = {};

  /** Whether the text is being changed from in here, so that one edit is not read as two. */
  let ours = false;

  /**
   * What is going on in the text besides the text: a word on offer, a name named, a name being
   * retyped everywhere. One machine, because they are modes of writing and only one of them can be
   * true — and because the one thing that has to hold between them, that nothing is offered while
   * a name is being retyped, is then not a rule anybody has to remember.
   */
  const writing = newWriting();

  /**
   * The text those lines were read from.
   *
   * Everything the gutter says is about the machine, and the machine was built from the text as
   * it was last read — which is not the text on screen while you are typing into it. Insert one
   * line at the top and every rule is one line further down than the map says: the marks point at
   * the wrong rules, and pointing at a cell lights the wrong lines. So they say nothing at all
   * until the reader has caught up, which it does a moment after you stop.
   */
  let read = "";
  const fresh = () => area.value === read;

  /** One row of the gutter and one line of the ink, by line number. */
  const rows = new Map<number, HTMLElement>();
  const lines = new Map<number, HTMLElement>();

  /**
   * The text, coloured, and the gutter beside it. Both are built line by line from the same split,
   * so a row of one is always the row of the other.
   */
  function paint(): void {
    const source = area.value.split("\n");
    // What the textarea is sized by: it must not scroll, so that the sheet can. Counted here
    // because this is where the text is already being counted; turned into a height and a width
    // in the stylesheet, in the units the layer behind it is set in.
    node.style.setProperty("--lines", String(source.length));
    node.style.setProperty(
      "--cols",
      String(Math.max(0, ...source.map((line) => line.length))),
    );
    rows.clear();
    lines.clear();

    code.replaceChildren(
      ...source.map((text, i) => {
        const line = make("span", "line");
        for (const t of tokenize(text))
          line.append(
            t.ink
              ? word(t.text, t.ink, t.ink === "q" ? colour(t.text) : undefined)
              : document.createTextNode(t.text),
          );
        lines.set(i + 1, line);
        return line;
      }),
    );

    gutter.replaceChildren(
      ...source.map((_, i) => {
        const at = i + 1;
        const row = make("div", "row");
        row.append(make("span", "num", String(at)), make("span", "run"));
        rows.set(at, row);
        wire(at, row);
        return row;
      }),
    );

    mark();
    dress();
    ghostly();
  }

  /**
   * A row of the gutter is the rule on that line, so it answers the pointer the way the figure's
   * own cells do — the same event, the same machine — and it is pressed the way the figure is
   * pressed, except that a line names a rule outright and needs no second click.
   */
  function wire(at: number, row: HTMLElement): void {
    row.addEventListener("mouseenter", () => {
      const rule = fresh() ? written.get(at) : undefined;
      // Both halves: the line says where the rule starts and where it ends, so the figure says
      // both too — two bands out of block 1 and two out of block 3, crossing at the corner.
      if (rule)
        w.focus.pointer.dispatch("enter", {
          keys: halvesOf(rule.edge),
          offer: true,
        });
    });
    row.addEventListener("mouseleave", () => {
      if (fresh() && written.has(at)) w.focus.pointer.dispatch("leave");
    });
    row.addEventListener("click", () => {
      const rule = fresh() ? written.get(at) : undefined;
      if (rule && w.fires(rule)) w.fire(rule);
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
  function mark(): void {
    const ok = fresh();
    for (const [at, row] of rows) {
      const rule = ok ? written.get(at) : undefined;
      const can = rule !== undefined && w.fires(rule);
      row.classList.toggle("can", can);
      row.classList.toggle("rule", rule !== undefined);
      row.classList.toggle("blame", at === blamed);
      if (can) row.setAttribute("style", colour(rule.edge.from) ?? "");
      else row.removeAttribute("style");
      row.title = can ? "take this rule" : "";
    }
  }

  /** What the figure is about, said of the text: the same question, asked of the same cells. */
  function dress(): void {
    const { shown } = w.focus.look();
    const ok = fresh();
    for (const [at, line] of lines) {
      const rule = ok ? written.get(at) : undefined;
      line.classList.toggle(
        "lit",
        rule !== undefined && shows(shown, rule.edge),
      );
    }
  }

  // ── finishing the word ──────────────────────────────────────────────────────

  /**
   * What would finish the word under the caret — asked of the language, answered to the machine.
   *
   * Only at the end of a line, and that is a rule about the two layers rather than about the
   * language: the ghost is a node in the coloured layer, and a node in the middle of a line pushes
   * the rest of that line sideways in one layer and not in the other, which puts the caret off the
   * word it is on. At the end of the line there is nothing to push.
   */
  function hint(): void {
    writing.dispatch("see", { at: reading() });
  }

  /** What the caret is over, in the language's terms. Whether it is worth an offer is not asked
      here: the machine has a state where nothing is offered whatever the caret is over. */
  function reading(): Offer | null {
    if (area.selectionStart !== area.selectionEnd) return null;
    const caret = area.selectionStart;
    const next = area.value[caret];
    if (next !== undefined && next !== "\n") return null;
    const upto = area.value.slice(0, caret).split("\n");
    const found = ahead(upto[upto.length - 1] ?? "", vocab);
    return found && { ...found, line: upto.length };
  }

  /** The offer, drawn. Called when it changes, and again whenever the layer is rebuilt under it. */
  function ghostly(): void {
    ghost.remove();
    const at = writing.state;
    if (at.type !== "ahead") return;
    ghost.textContent = at.context.rest;
    lines.get(at.context.line)?.append(ghost);
  }

  /**
   * Write into the text, keeping the browser's own undo where the browser will have it. Assigning
   * to `value` throws that stack away, and an editor you cannot undo in is not an editor.
   */
  function put(from: number, to: number, text: string, caret?: number): void {
    ours = true;
    try {
      area.setSelectionRange(from, to);
      if (!document.execCommand?.("insertText", false, text))
        area.setRangeText(text, from, to, "end");
      if (caret !== undefined) area.setSelectionRange(caret, caret);
    } finally {
      ours = false;
    }
    paint();
    hint();
    w.onEdit();
  }

  /** The same text, changed in the one stretch where it differs. */
  function patch(text: string, caret: number): void {
    const was = area.value;
    if (was === text) return void area.setSelectionRange(caret, caret);
    let a = 0;
    while (a < was.length && a < text.length && was[a] === text[a]) a++;
    let b = 0;
    while (
      b < was.length - a &&
      b < text.length - a &&
      was[was.length - 1 - b] === text[text.length - 1 - b]
    )
      b++;
    put(a, was.length - b, text.slice(a, text.length - b), caret);
  }

  // ── renaming a name in every line it stands in ──────────────────────────────

  /**
   * A keystroke while the mode is on, landing in every line the word is written on.
   *
   * The whole text is worked out again from the text as it stood when the mode was armed, so no
   * keystroke depends on the one before it. What is checked first is that this keystroke was
   * *inside the word*: everything before it and everything after it must still read as it did, or
   * the reader has gone somewhere else and the mode is over.
   */
  function retype(): boolean {
    const at = writing.state;
    // A word named and then typed over rather than armed is ordinary typing: `see` lets it go,
    // the way it lets go of everything else the caret has moved away from.
    if (at.type !== "renaming") return false;
    const c = at.context;
    const held = spread(c);
    const caret = area.selectionStart;
    const typed = area.value.slice(held.at, caret);
    const sound =
      caret >= held.at &&
      caret === area.selectionEnd &&
      !/\s/.test(typed) &&
      area.value.slice(0, held.at) === held.text.slice(0, held.at) &&
      area.value.slice(caret) === held.text.slice(held.at + c.now.length);
    if (!sound) {
      writing.dispatch("drop");
      return false;
    }
    writing.dispatch("retype", { now: typed });
    const next = spread(writing.state.context as typeof c);
    patch(next.text, next.at + typed.length);
    return true;
  }

  /** What the chip says, which is the whole of the mode's face. */
  function badge(): void {
    const at = writing.state;
    const on = at.type === "renaming";
    chip.hidden = !on && at.type !== "picked";
    if (chip.hidden) return;
    const { word: name } = at.context as { word: string };
    chip.classList.toggle("on", on);
    chip.textContent = on ? `renaming ${name}` : `rename ${name}`;
    chip.title = on
      ? "type the new name — every line follows. Esc to stop"
      : `retype ${name} in every line it is written on`;
  }

  chip.addEventListener("click", () => {
    const at = writing.state;
    if (at.type !== "picked") return void writing.dispatch("drop");
    const { at: from, to } = at.context;
    writing.dispatch("arm", { base: area.value });
    // The word is left selected, so that typing replaces it — which is what the mode is for.
    area.focus();
    area.setSelectionRange(from, to);
  });

  // A word is named by double-clicking it, which is how the text is read anyway. Naming one
  // commits to nothing: the chip appears, and until it is pressed this is an ordinary editor.
  area.addEventListener("dblclick", () => {
    const raw = area.value.slice(area.selectionStart, area.selectionEnd);
    const name = raw.trim();
    const from = area.selectionStart + raw.indexOf(name);
    writing.dispatch("pick", { word: name, at: from, to: from + name.length });
  });

  // Clicking somewhere else lets the word go — but a double-click is two clicks, and the second
  // of them is the one that named it.
  area.addEventListener("mousedown", (e) => {
    if (e.detail === 1) writing.dispatch("drop");
  });

  area.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return void writing.dispatch("drop");
    const at = writing.state;
    if (e.key !== "Tab" || at.type !== "ahead") return;
    // The word, and the space after it: the next word is what you were going to type anyway.
    e.preventDefault();
    const caret = area.selectionStart;
    put(caret - at.context.typed.length, caret, `${at.context.word} `);
  });

  area.addEventListener("input", () => {
    // `put` finishes what it started; this is the keystrokes that came from a keyboard.
    if (ours) return;
    if (retype()) return;
    // The colour is immediate and the reading of it is not: one is a look at what you typed, the
    // other rebuilds a machine, and only the second is worth waiting a moment for.
    paint();
    hint();
    w.onEdit();
  });

  // The ghost is about where the caret is, and the caret moves without the text changing.
  for (const kind of ["keyup", "click", "focus"] as const)
    area.addEventListener(kind, () => hint());
  area.addEventListener("blur", () => writing.dispatch("hide"));

  const off: Off[] = [
    w.focus.choice.rx.on(TRANSITION, () => dress()),
    w.focus.pointer.rx.on(TRANSITION, () => dress()),
    // One machine, so one redraw: the ghost and the chip are two faces of the same state.
    writing.rx.on(TRANSITION, () => {
      ghostly();
      badge();
    }),
  ];

  return {
    node,
    text: () => area.value,
    set: (text) => {
      area.value = text;
      writing.dispatch("drop");
      paint();
    },
    show: (rules, lane) => {
      written = new Map(rules.map((r) => [r.at, r]));
      colour = lane;
      read = area.value;
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
      vocab = { q: sorted(q), s: sorted(s), l: sorted(l), op: sorted(op) };
      paint();
    },
    mark,
    blame: (message, line) => {
      blamed = line;
      note.textContent = message ?? "";
      note.hidden = message === null;
      mark();
    },
    stop: () => {
      for (const it of off) it();
    },
  };
}

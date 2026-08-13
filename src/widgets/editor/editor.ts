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
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { Off } from "@evgkch/fsmjs";
import { causeOf, shows } from "../../entities/cell/index.js";
import type { Lane } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { make, word } from "../../shared/lib/dom.js";
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
  /** The line the reader is complaining about, or none. */
  readonly blame: (line: number | null) => void;
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

  const gutter = make("div", "gutter");
  const sheet = make("div", "sheet");
  sheet.append(ink, area);
  const node = make("div", "editor");
  node.append(gutter, sheet);

  /** Where every rule is written, by line. A line holds at most one rule; most hold none. */
  let written = new Map<number, Written>();
  let colour: Lane = () => undefined;
  let blamed: number | null = null;

  /** One row of the gutter and one line of the ink, by line number. */
  const rows = new Map<number, HTMLElement>();
  const lines = new Map<number, HTMLElement>();

  /**
   * The text, coloured, and the gutter beside it. Both are built line by line from the same split,
   * so a row of one is always the row of the other.
   */
  function paint(): void {
    const source = area.value.split("\n");
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
        row.append(make("span", "num", String(at)), make("span", "run", "▸"));
        rows.set(at, row);
        wire(at, row);
        return row;
      }),
    );

    mark();
    dress();
    scrolled();
  }

  /**
   * A row of the gutter is the rule on that line, so it answers the pointer the way the figure's
   * own cells do — the same event, the same machine — and it is pressed the way the figure is
   * pressed, except that a line names a rule outright and needs no second click.
   */
  function wire(at: number, row: HTMLElement): void {
    row.addEventListener("mouseenter", () => {
      const rule = written.get(at);
      if (rule) w.focus.pointer.dispatch("enter", { key: causeOf(rule.edge) });
    });
    row.addEventListener("mouseleave", () => {
      if (written.has(at)) w.focus.pointer.dispatch("leave");
    });
    row.addEventListener("click", () => {
      const rule = written.get(at);
      if (rule && w.fires(rule)) w.fire(rule);
    });
  }

  /** Which rules can fire from where the machine stands — the only thing here the run changes. */
  function mark(): void {
    for (const [at, row] of rows) {
      const rule = written.get(at);
      const can = rule !== undefined && w.fires(rule);
      row.classList.toggle("can", can);
      row.classList.toggle("rule", rule !== undefined);
      row.classList.toggle("blame", at === blamed);
      row.title = can ? "take this rule" : "";
    }
  }

  /** What the figure is about, said of the text: the same question, asked of the same cells. */
  function dress(): void {
    const { shown } = w.focus.look();
    for (const [at, line] of lines) {
      const rule = written.get(at);
      line.classList.toggle(
        "lit",
        rule !== undefined && shows(shown, rule.edge),
      );
    }
  }

  /** Only one of the three layers scrolls; the other two are moved to match. */
  function scrolled(): void {
    ink.style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`;
    gutter.style.transform = `translateY(${-area.scrollTop}px)`;
  }

  area.addEventListener("scroll", scrolled);
  area.addEventListener("input", () => {
    // The colour is immediate and the reading of it is not: one is a look at what you typed, the
    // other rebuilds a machine, and only the second is worth waiting a moment for.
    paint();
    w.onEdit();
  });

  const off: Off[] = [
    w.focus.choice.rx.on(TRANSITION, () => dress()),
    w.focus.pointer.rx.on(TRANSITION, () => dress()),
  ];

  return {
    node,
    text: () => area.value,
    set: (text) => {
      area.value = text;
      paint();
    },
    show: (rules, lane) => {
      written = new Map(rules.map((r) => [r.at, r]));
      colour = lane;
      paint();
    },
    mark,
    blame: (line) => {
      blamed = line;
      mark();
    },
    stop: () => {
      for (const it of off) it();
    },
  };
}

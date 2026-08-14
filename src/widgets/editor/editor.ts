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
import { ruleId } from "../../entities/machine/index.js";
import type { Flaws, Lane } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { newWriting } from "../../features/write-rules/index.js";
import type { Facts, Typing } from "../../features/write-rules/index.js";
import { make, word } from "../../shared/lib/dom.js";
import { rhythm } from "../../shared/lib/grid.js";
import type { Vocab } from "../../shared/lang/complete.js";
import type { Written } from "../../shared/lang/rules.js";
import { tokenize } from "../../shared/lang/tokens.js";
import "./ui/editor.css";

export type Editor = {
  readonly node: HTMLElement;
  readonly text: () => string;
  /** Put a schema in it, as text. */
  readonly set: (text: string) => void;
  /**
   * What the last reading found: where every rule is written, the colour of every state, and what
   * is wrong with the schema — which is drawn on the words and the lines it is wrong about.
   */
  readonly show: (rules: readonly Written[], colour: Lane, bad: Flaws) => void;
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
  /** Where it stands, if it stands anywhere: exploring, no state is current. */
  here: () => string;
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
  const say = make("p", "say");
  const node = make("div", "editor");
  node.append(tag, sheet, say);
  // A line here is a rule, and a rule is a row of the figure: one height, from one place.
  rhythm(node);

  /** Where every rule is written, by line. A line holds at most one rule; most hold none. */
  let written = new Map<number, Written>();
  let colour: Lane = () => undefined;
  let blamed: number | null = null;
  /** What the strip at the foot has to choose between: a complaint, and the size of the thing. */
  let wrong: string | null = null;
  let counts = "";
  /** What `analyze` and `validate` make of the schema this text was read as. */
  let bad: Flaws | null = null;

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
              ? word(
                  t.text,
                  t.ink === "q" ? `q${stranded(t.text)}` : t.ink,
                  t.ink === "q" ? colour(t.text) : undefined,
                )
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
        // The mark first, then the number. Where a debugger puts what you press is the outside
        // edge — nothing is nearer the hand, and nothing else in the column moves when one
        // appears, because the column is always there.
        row.append(make("span", "run"), make("span", "num", String(at)));
        rows.set(at, row);
        wire(at, row);
        return row;
      }),
    );

    mark();
    dress();
    ghostly();
    say.textContent = wrong ?? counts;
    say.classList.toggle("wrong", wrong !== null);
  }

  /**
   * What is true of a state, written on the state — the same two facts the figure draws on its own
   * index, so the word is struck through in both places or in neither. Nothing is listed anywhere:
   * a list of names beside a text full of those names is a lookup table for what you are looking
   * at, and three of its four rows were about single words in it.
   */
  function stranded(name: string): string {
    if (!bad) return "";
    return `${bad.off.has(name) ? " off" : ""}${bad.ends.has(name) ? " end" : ""}`;
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
      // both too — two bands out of block 1 and two out of block 3, crossing at the corner. A line
      // with no rule on it names none, which is a fact and not a reason to say nothing: the
      // pointer machine has one guard for naming nothing, and it is the same guard the figure's
      // out-of-reach cells meet.
      w.focus.pointer.dispatch("enter", {
        keys: rule ? halvesOf(rule.edge) : [],
        offer: true,
        alive: true,
      });
    });
    row.addEventListener("mouseleave", () => w.focus.pointer.dispatch("leave"));
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
    // Where the machine stands, said on the state itself and not only on the lines that leave it.
    // A state with nothing leaving it has no marked line at all, and a run that ends there would
    // otherwise leave the source saying nothing about where it ended.
    const here = w.here();
    for (const [, line] of lines)
      for (const q of line.querySelectorAll(".q"))
        q.classList.toggle("here", here !== "" && q.textContent === here);
    for (const [at, row] of rows) {
      const rule = ok ? written.get(at) : undefined;
      const can = rule !== undefined && w.fires(rule);
      // A rule that can never fire, whatever you do: nothing reaches the state it leaves, or an
      // unguarded rule ahead of it in its cell always wins. The gutter is where a debugger says
      // that, on the line it is about.
      const gone =
        rule !== undefined &&
        (bad?.dead(ruleId(rule.edge.from, rule.edge.on, rule.slot)) ?? false);
      row.classList.toggle("can", can);
      row.classList.toggle("rule", rule !== undefined);
      row.classList.toggle("dead", gone);
      // Dead text reads as dead text, which is what every debugger does with a line that cannot
      // run. The gutter says which fault it is; the line says not to spend time on it.
      lines.get(at)?.classList.toggle("dead", gone);
      row.classList.toggle("blame", at === blamed);
      if (can) row.setAttribute("style", colour(rule.edge.from) ?? "");
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
  function dress(): void {
    const { shown } = w.focus.look();
    const ok = fresh();
    for (const [at, line] of lines) {
      const rule = ok ? written.get(at) : undefined;
      const on = rule !== undefined && shows(shown, rule.edge);
      line.classList.toggle("lit", on);
      rows.get(at)?.classList.toggle("lit", on);
    }
  }

  // ── what the machine is told ────────────────────────────────────────────────

  /**
   * The facts, as the DOM has them at the moment something happened. This is the whole of what
   * the machine is handed: which key, how many clicks, what the text reads, where the caret is.
   * Nothing here decides what any of it means — that is the schema's, and keeping it there is the
   * difference between a machine and a handler that dispatches the conclusion it already drew.
   */
  const facts = (e?: Event): Facts => ({
    key: e && "key" in e ? String((e as KeyboardEvent).key) : "",
    clicks:
      e instanceof area.ownerDocument.defaultView!.MouseEvent ? e.detail : 0,
    text: area.value,
    caret: area.selectionStart,
    end: area.selectionEnd,
    vocab,
  });

  const tell = (kind: Exclude<keyof Typing, "drop">, e?: Event): boolean =>
    // `write` finishes what it started, and its own `input` is not a keystroke.
    ours ? false : writing.dispatch(kind, facts(e));

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
  function write(from: number, to: number, text: string, caret?: number): void {
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
    // The caret is somewhere new, so what is on offer is a new question.
    tell("moved");
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
    write(a, was.length - b, text.slice(a, text.length - b), caret);
  }

  // ── renaming a name in every line it stands in ──────────────────────────────

  /** What the chip says, which is the whole of the mode's face. */
  function badge(): void {
    const at = writing.state;
    if (at.type !== "picked" && at.type !== "renaming")
      return void (chip.hidden = true);
    chip.hidden = false;
    const on = at.type === "renaming";
    const name = at.context.word;
    chip.classList.toggle("on", on);
    chip.textContent = on ? `renaming ${name}` : `rename ${name}`;
    chip.title = on
      ? "type the new name — every line follows. Esc to stop"
      : `retype ${name} in every line it is written on`;
  }

  /**
   * Every event the box has, handed over as it comes.
   *
   * There is no `if` here on purpose. Which of these means anything, and what — that Escape lets a
   * word go, that one click is not two, that TAB finishes a word only where one is on offer — is
   * written once, in the schema, where it can be read in one place and dumped as a graph like
   * everything else this tool draws.
   */
  for (const kind of ["mousedown", "dblclick", "blur"] as const)
    area.addEventListener(kind, (e) => tell(kind, e));

  // The text changed, and two things always follow whatever it meant: the colour is redrawn now,
  // and the reader is set going, which is slower and worth waiting a moment for.
  area.addEventListener("input", (e) => {
    if (ours) return;
    tell("input", e);
    paint();
    w.onEdit();
  });

  // Three events of the DOM and one fact: the caret may have moved.
  for (const kind of ["keyup", "click", "focus"] as const)
    area.addEventListener(kind, (e) => tell("moved", e));

  /**
   * Set by `filled`, which is the only edit a keystroke can ask for. The key the machine consumed
   * must not also do what the browser would do with it — and which key that was is not asked here.
   */
  let swallowed = false;
  area.addEventListener("keydown", (e) => {
    swallowed = false;
    tell("keydown", e);
    if (swallowed) e.preventDefault();
  });

  chip.addEventListener("click", () => tell("press"));

  const off: Off[] = [
    w.focus.choice.rx.on(TRANSITION, () => dress()),
    w.focus.pointer.rx.on(TRANSITION, () => dress()),
    // One machine, so one redraw: the ghost and the chip are two faces of the same state.
    writing.rx.on(TRANSITION, () => {
      ghostly();
      badge();
    }),
    // The three edits the machine asks for. Each is worked out from what it holds and arrives
    // finished; nothing here knows which state asked, or why.
    //
    // After the transition and not inside it: these arrive while the machine is still
    // dispatching, and every one of them ends in a `see` — the caret has moved, so what is on
    // offer is a new question. The library forbids nesting dispatches, and is right to.
    writing.rx.on("armed", ({ from, to }) =>
      queueMicrotask(() => {
        area.focus();
        area.setSelectionRange(from, to);
      }),
    ),
    writing.rx.on("filled", ({ from, to, text }) => {
      swallowed = true;
      queueMicrotask(() => write(from, to, text));
    }),
    writing.rx.on("rewritten", ({ text, caret }) =>
      queueMicrotask(() => patch(text, caret)),
    ),
  ];

  return {
    node,
    text: () => area.value,
    set: (text) => {
      area.value = text;
      writing.dispatch("drop");
      paint();
    },
    show: (rules, lane, facts) => {
      written = new Map(rules.map((r) => [r.at, r]));
      colour = lane;
      bad = facts;
      read = area.value;
      // How big it is, and then only what is wrong. A schema with nothing to report says its two
      // numbers and stops, which is how you can tell at a glance that there is nothing to report.
      const many = (n: number, one: string) =>
        `${n} ${one}${n === 1 ? "" : "s"}`;
      counts = [
        many(facts.all.length, "state"),
        many(facts.rules, "rule"),
        ...(facts.off.size ? [`${facts.off.size} nothing reaches`] : []),
        ...(facts.ends.size ? [`${facts.ends.size} nothing leaves`] : []),
      ].join(" · ");
      wrong = null;
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
      wrong = message;
      say.textContent = wrong ?? counts;
      say.classList.toggle("wrong", wrong !== null);
      mark();
    },
    stop: () => {
      for (const it of off) it();
    },
  };
}

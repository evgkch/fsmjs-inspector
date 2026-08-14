/**
 * The schemas the page offers, read out of `schemas/` as text.
 *
 * Files rather than literals, because a schema is a document: something to open, to diff, to
 * hand to somebody. Three of them are written by hand. The other six are not written at all —
 * they are `JSON.stringify` of every machine this tool runs on, produced by `scripts/dump.mjs`
 * before every build, so the page's first subject is the page. There is no seventh: the tool has
 * six machines and the list is all of them.
 *
 * Open `the inspector's choice` and the figure draws the thing that was deciding what the figure
 * did while you were pointing at it — three states, one cell of three rules, and every guard by
 * name. Open `the inspector's editor` and it draws what the box on the left is doing with the
 * keystrokes you type into it while you read it; `the inspector's panel` is the drag that moves the
 * floating window `inspect()` puts over an application. Nothing was written twice to make any of
 * that work: a dump is what a machine says about itself.
 *
 * They are kept as JSON because that is what `JSON.stringify(machine)` writes, and `dump.mjs`
 * has nothing else to write. What the editor shows is `toRules` of the same thing: the schema in
 * the language it is written in, which is also the language every line of the history is in.
 */
import choice from "../../../../schemas/the-inspectors-choice.json?raw";
import editor from "../../../../schemas/the-inspectors-editor.json?raw";
import mode from "../../../../schemas/the-inspectors-mode.json?raw";
import page from "../../../../schemas/the-inspectors-page.json?raw";
import pointer from "../../../../schemas/the-inspectors-pointer.json?raw";
import panel from "../../../../schemas/the-inspectors-panel.json?raw";
import problems from "../../../../schemas/a-schema-with-problems.json?raw";
import selection from "../../../../schemas/selection-rectangle.json?raw";
import upload from "../../../../schemas/upload-with-retry.json?raw";

/** A run starts at the first state the file names, which is what `nodes` returns first. */
export type Sample = { name: string; json: string };

export const SAMPLES: Sample[] = [
  { name: "Selection rectangle", json: selection },
  { name: "Upload with retry", json: upload },
  { name: "A schema with problems", json: problems },
  { name: "The inspector's choice", json: choice },
  { name: "The inspector's pointer", json: pointer },
  { name: "The inspector's page", json: page },
  { name: "The inspector's editor", json: editor },
  { name: "The inspector's mode", json: mode },
  { name: "The inspector's panel", json: panel },
];

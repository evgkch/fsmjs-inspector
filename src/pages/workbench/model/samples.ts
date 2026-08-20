/**
 * The schemas the page offers, read out of `schemas/` as text. Three are written by hand; the
 * other seven are `JSON.stringify` of the tool's own machines, produced by `scripts/dump.mjs`
 * before every build, so they cannot drift from the code. Kept as JSON — the form a dump has;
 * the editor shows `toRules` of the same thing.
 */
import choice from "../../../../schemas/the-inspectors-choice.json?raw";
import editor from "../../../../schemas/the-inspectors-editor.json?raw";
import page from "../../../../schemas/the-inspectors-page.json?raw";
import pointer from "../../../../schemas/the-inspectors-pointer.json?raw";
import panel from "../../../../schemas/the-inspectors-panel.json?raw";
import problems from "../../../../schemas/a-schema-with-problems.json?raw";
import sight from "../../../../schemas/the-inspectors-sight.json?raw";
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
  { name: "The inspector's panel", json: panel },
  { name: "The inspector's sight", json: sight },
];

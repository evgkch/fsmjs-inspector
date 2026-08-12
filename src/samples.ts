/**
 * The schemas the page offers, read out of `schemas/` as text.
 *
 * Files rather than literals, because a schema is a document: something to open, to diff, to
 * hand to somebody. Three of them are written by hand. The other three are not written at all —
 * they are `JSON.stringify` of the machines this page itself runs on, produced by
 * `scripts/dump.mjs` before every build, so the page's first subject is the page.
 *
 * That is the claim in the lede made checkable rather than asserted. Open `the inspector's
 * choice` and the figure draws the thing that was deciding what the figure did while you were
 * pointing at it — three states, one cell of three rules, and every guard by name. Nothing was
 * written twice to make that work: a dump is what a machine says about itself.
 */
import choice from "../schemas/the-inspectors-choice.json?raw";
import page from "../schemas/the-inspectors-page.json?raw";
import pointer from "../schemas/the-inspectors-pointer.json?raw";
import problems from "../schemas/a-schema-with-problems.json?raw";
import selection from "../schemas/selection-rectangle.json?raw";
import upload from "../schemas/upload-with-retry.json?raw";

/** A run starts at the first state the file names, which is what `nodes` returns first. */
export type Sample = { name: string; json: string };

export const SAMPLES: Sample[] = [
  { name: "Selection rectangle", json: selection },
  { name: "Upload with retry", json: upload },
  { name: "A schema with problems", json: problems },
  { name: "The inspector's choice", json: choice },
  { name: "The inspector's pointer", json: pointer },
  { name: "The inspector's page", json: page },
];

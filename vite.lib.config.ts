import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

/**
 * The palette, published on its own.
 *
 * `@evgkch/fsmjs-inspector/tokens.css` is a file of the package's manifest, so it has to be in
 * `dist-lib` whenever `dist-lib` exists — and it is the one thing there that is not a build
 * product: it is the `fsmjs-tokens` submodule's file, copied. That copy used to be a `cp` in the npm
 * script beside the build, which meant the build alone produced a `dist-lib` that was missing a
 * file the manifest promises, and the promise is what somebody else's stylesheet imports. Running
 * the build on its own is a thing anybody does; emitting it here makes one command enough.
 *
 * Emitted rather than copied, so it goes wherever the output goes and is cleared with it.
 *
 * It lands where the source has it, under `shared/ui`, and not at the root — that is the path the
 * manifest maps `./tokens.css` onto, and one mapping is cheaper than a copy at the root beside
 * the tree. What a reader writes is `@evgkch/fsmjs-inspector/tokens.css` either way: the name is
 * the manifest's, and where the file sits under it is nobody's business but this build's.
 */
const TOKENS = "shared/ui/tokens/tokens.css";

const tokens = (): Plugin => ({
  name: "fsmjs-inspector-tokens",
  // The library build only. The site's own build has no manifest to keep.
  apply: "build",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: TOKENS,
      source: readFileSync(`src/${TOKENS}`, "utf8"),
    });
  },
});

/**
 * The package, as opposed to the page. `vite.config.ts` builds the standalone site out of
 * `index.html`; this builds `src/index.ts` into something another application can import.
 *
 * The library is left out of the bundle: whoever embeds the inspector already has a machine, and
 * a second copy of `fsmjs` would be a second `TRANSITION` symbol — the listener would never fire.
 *
 * Two entries, and which one is the main one is the whole point. `index` is `inspect(fsm)`: what an
 * application writes, with no document and no stylesheet in it, because the thing being debugged
 * may have neither — a server, a worker, a test run. `ui` is the tool, for a page that wants to
 * draw the figure itself, and importing it means importing a stylesheet.
 *
 * What that stylesheet now is has changed, and the manifest's three CSS entries say it: the widgets
 * carry their own into their shadow roots, so `ui.css` is what is left for the light DOM — the
 * mount's grid and the overlay — and `tokens.css` is the palette, which crosses into a shadow root
 * on its own because a custom property is inherited.
 */
export default defineConfig({
  plugins: [tokens()],
  build: {
    outDir: "dist-lib",
    lib: {
      entry: { index: "src/index.ts", ui: "src/ui.ts" },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^@evgkch\//, /^lit/],
      // Named after the entry that carries it, which is `ui` — the main entry has no stylesheet at
      // all, and a file called `index.css` beside a JavaScript file that never mentions a document
      // would be the manifest's one confusing sentence.
      output: { assetFileNames: "ui[extname]" },
    },
  },
});

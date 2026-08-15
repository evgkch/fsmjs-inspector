import { defineConfig } from "vite";

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
 */
export default defineConfig({
  build: {
    outDir: "dist-lib",
    lib: {
      entry: { index: "src/index.ts", ui: "src/ui.ts" },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^@evgkch\//],
      // Named after the entry that carries it, which is `ui` — the main entry has no stylesheet at
      // all, and a file called `index.css` beside a JavaScript file that never mentions a document
      // would be the manifest's one confusing sentence.
      output: { assetFileNames: "ui[extname]" },
    },
  },
});

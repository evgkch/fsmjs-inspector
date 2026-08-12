import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs: the same build serves from the root locally and from
  // /fsmjs/inspector/ on GitHub Pages, with no base path to pass in.
  base: "./",
});

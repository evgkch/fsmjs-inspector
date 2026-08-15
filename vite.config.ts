import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs: the same build serves from the root locally and from
  // /fsmjs/inspector/ on GitHub Pages, with no base path to pass in.
  base: "./",
  build: {
    // The minifier is lightningcss, and it refuses a selector it does not know rather than
    // passing it through: a rule that reaches inside a select's own picker —
    // `::picker(select) option` — is a syntax error to it, and the build stops. That rule is the
    // whole of how the drop-down list is dressed. The cost of turning the minifier off is that
    // the stylesheet ships with its prose in it, which is most of its bytes; the alternative is
    // writing the one part of the page the platform used to draw a second time, in a shape a
    // minifier likes, and that is the wrong thing to spend a stylesheet on.
    cssMinify: false,
  },
});

/**
 * The standalone page, started.
 *
 * Everything it is made of is a slice below this one; what is left here is saying which page this
 * is and letting it go. The one line of prose is the tool's own claim about itself, said where a
 * tool says such things.
 */
import "../shared/ui/tokens/tokens.css";
import { workbench } from "../pages/workbench/workbench.js";

console.log(
  "%cfsmjs inspector%c\n" +
    "A machine's graph is a projection of the machine itself: JSON.stringify keeps the labels\n" +
    "and writes the name of every operation in place of its code. What is left is enough to draw\n" +
    "the machine, to check it — and, with no operations in it at all, to still run it.\n" +
    "https://github.com/evgkch/fsmjs-inspector",
  "font-weight:700",
  "font-weight:400",
);

workbench();

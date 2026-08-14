/**
 * The grid everything on this page is drawn on.
 *
 * One number, and it is the pitch of the rows: a cell of the figure, the spacing of the lanes,
 * and the width of a slice of the history. The figure and the history are two drawings of the
 * same states, and the second continues the rows of the first across the page — so the two cannot
 * each keep a number of their own and hope they stay equal.
 */
export const CELL = 24;

/**
 * The same number, for the stylesheet. A line of the source, a row of the figure and a slice of
 * the run are the same thing said three ways, so they are the same height — and the height is
 * declared once, here, rather than written as a line-height in one file and a cell size in
 * another and kept equal by whoever notices.
 */
export const rhythm = (node: HTMLElement): void =>
  node.style.setProperty("--cell", `${CELL}px`);

/** Width of one monospace character at the size the figure's labels use. */
export const EM = 7.2;

/**
 * How far down the first row of states sits — in the figure, and in anything drawn on its rows.
 *
 * It is a constant and not a measurement, and that is the point. Everything the figure hangs off
 * its indices hangs *downwards*: the names of the columns are under the grid, between the two
 * blocks that share them, and the outputs are under those. So above the first row there is one
 * thing only — the line the indices are named on — and its height is the same for every schema.
 * The run beside the figure is drawn on these rows and can simply start where they start, instead
 * of being told each time how far a band of words stood on end had pushed them down.
 */
export const HEAD = 24;

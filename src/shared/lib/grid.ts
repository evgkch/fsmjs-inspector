/**
 * The grid everything on this page is drawn on.
 *
 * One number, and it is the pitch of the rows: a cell of the figure, the spacing of the lanes,
 * and the width of a slice of the history. The figure and the history are two drawings of the
 * same states, and the second continues the rows of the first across the page — so the two cannot
 * each keep a number of their own and hope they stay equal.
 */
export const CELL = 24;

/** Width of one monospace character at the size the figure's labels use. */
export const EM = 7.2;

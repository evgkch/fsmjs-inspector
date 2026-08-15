/**
 * Subjects that are somewhere else — machines running in another tab, another process or another
 * host, drawn here from what they say about themselves.
 *
 * This is the third implementation of `Subject`, and the figure will not know: a dump, a machine
 * in this scope, and now a machine at the end of a pipe. What arrives is described in
 * `model/wire`; what carries it is a `Link`; neither of them appears above this file.
 *
 * It answers with a *roster* rather than with one subject, because one application has more than
 * one machine in it and the interesting ones are usually running at once. Every publisher names
 * itself, so what comes back is a list of who is out there, and the page picks.
 *
 * What such a subject can do is what the application said it can, and the application said it by
 * handing `inspect` the things it already had. No `drive`: sending an event to a machine in
 * another process is a debugger's right and is not this hop's business yet. `rewind` only where a
 * `History` was handed over — then walking the run does move somebody else's machine, which is
 * what rewinding a machine is, and is why it takes an instance and not a flag.
 *
 * Both are absent rather than refused. A missing `rewind` is the whole of "this run is a record
 * and not a control", and every drawing already asks.
 */
import Channel from "@evgkch/channeljs";
import type { Rx } from "@evgkch/channeljs";
import type { Edge } from "@evgkch/fsmjs";
import type { Graph, Step } from "../model/graph.js";
import type { Change, Subject } from "../model/subject.js";
import { isWire } from "../model/wire.js";
import type { Link } from "../../../shared/api/link.js";

/** One machine out there: who it is, what to call it, and the subject drawn from it. */
export type Watched = {
  readonly who: string;
  readonly name: string;
  /** What the machine is for, said by whoever wrote the line. Empty when nobody did. */
  readonly note: string;
  readonly subject: Subject;
};

/** Said when the list changes: somebody arrived, left, or became a different machine. */
export type Roster = { roster: [] };

export type Presence = {
  /** Who is out there, in the order they announced themselves. */
  readonly list: () => readonly Watched[];
  readonly rx: Rx<Roster>;
  readonly stop: () => void;
};

/**
 * A step, built back from the names it was sent as.
 *
 * The two contexts and the payload are gone, and nothing downstream reaches for them: the history
 * reads four `type`s off a step and the figure reads none. What a state carries cannot survive a
 * wire anyway, so it is not pretended into existence here — it is `undefined`, which is what a
 * state of a dumped machine carries.
 */
const stepOf = (e: Edge, at: number): Step =>
  ({
    source: { type: e.from, context: undefined },
    input: { type: e.on },
    target: { type: e.to, context: undefined },
    ...(e.emit === undefined ? {} : { output: { type: e.emit } }),
    // The time it happened at, over there. A transition carries its own now, so the run arrives
    // whole rather than as a list of steps beside a list of clocks.
    at,
  }) as Step;

/** One machine's side of the roster: what it last said, and the subject reading it. */
type Entry = {
  name: string;
  note: string;
  /** The graph as it arrived, kept to tell a reconnection from a different machine. */
  text: string;
  graph: Graph;
  at: string;
  /** Where in `steps` it is standing — not the end of them, once somebody has walked it back. */
  pos: number;
  can: { history: boolean };
  steps: Step[];
  said: Channel<{ moved: [what: Change] }>;
  subject: Subject;
};

export function fromWire(link: Link): Presence {
  const seen = new Map<string, Entry>();
  const roster = new Channel<Roster>();
  const moved = () => void roster.tx.send("roster");

  // The entry and the subject reading it are one object: the subject is getters over the fields
  // above it, so a `hello` that lands in the entry is on screen without anything being told twice.
  /**
   * What that machine allows arrives with the hello that made this entry, and is fixed for it: a
   * `rewind` that appears halfway through the life of a subject would be a drawing that becomes a
   * control while somebody is reading it. An application that starts allowing something else has
   * called `inspect` again, which is a different machine to this page and gets its own entry.
   */
  const entry = (
    who: string,
    name: string,
    note: string,
    graph: Graph,
    text: string,
    can: { history: boolean },
  ): Entry => {
    const it = {
      name,
      note,
      text,
      graph,
      at: "",
      pos: 0,
      can,
      steps: [] as Step[],
      said: new Channel<{ moved: [what: Change] }>(),
    };
    const subject: Subject = {
      get graph() {
        return it.graph;
      },
      get at() {
        return it.at;
      },
      get steps() {
        return it.steps;
      },
      // Where the far end says it is standing. Not the end of the steps: a run that has been
      // walked back looks exactly like one that has not, and the difference is the point.
      get step() {
        return it.pos;
      },
      // Asked of the far end, which does the walking. There is no local guess at what it will do
      // and no local record of where it went: `jump` goes up the wire and what comes back is a
      // hello, which is the whole state of that machine restated.
      ...(can.history && {
        rewind: (step: number) => link.send({ say: "jump", who, step }),
      }),
      watch: (on) => it.said.rx.on("moved", (what) => on(what)),
      // Let go of this drawing's listeners. The pipe is the roster's, and one panel closing is not
      // a reason to stop hearing the machine it was drawing.
      stop: () => it.said.clear(),
    };
    return Object.assign(it, { subject });
  };

  const told = (it: Entry, what: Change) => void it.said.tx.send("moved", what);

  const off: (() => void)[] = [
    link.rx.on("hear", (msg) => {
      if (!isWire(msg)) return;
      switch (msg.say) {
        // Somebody else asking. A viewer is not a publisher and has nothing to answer with.
        case "hail":
          return;

        case "hello": {
          const text = JSON.stringify(msg.graph);
          const old = seen.get(msg.who);
          // The same machine saying hello again — a reconnection, or the application restarted
          // with its schema unchanged. Its run is whatever it now says it is, and the panel
          // drawing it stays where it is, because it is the same machine.
          if (old && old.text === text) {
            old.name = msg.name;
            old.note = msg.note;
            old.at = msg.at;
            old.pos = msg.step;
            old.steps = msg.steps.map((w) => stepOf(w.edge, w.t));
            told(old, { say: "restore" });
            return;
          }
          // A different schema under the same name is a different machine, and gets a different
          // subject: everything a figure works out — its lanes, its colours, its axes — is read
          // off the graph once, and a graph swapped underneath it would be a figure of neither.
          const it = entry(
            msg.who,
            msg.name,
            msg.note,
            msg.graph,
            text,
            msg.can,
          );
          it.at = msg.at;
          it.pos = msg.step;
          it.steps = msg.steps.map((w) => stepOf(w.edge, w.t));
          seen.set(msg.who, it);
          moved();
          return;
        }

        case "step": {
          const it = seen.get(msg.who);
          // A step from somebody we have no graph for: it arrived before the hello, or after a
          // pipe came back. Ask, rather than draw a run through a machine we cannot draw.
          if (!it) return void link.send({ say: "hail" });
          // A step taken after a walk back drops the future it was walked back from, which the
          // far end has already done to its own list — this follows rather than decides.
          it.steps.length = it.pos;
          it.steps.push(stepOf(msg.went.edge, msg.went.t));
          it.pos = it.steps.length;
          it.at = msg.at;
          told(it, { say: "step" });
          return;
        }

        case "bye": {
          const it = seen.get(msg.who);
          if (!it) return;
          it.said.clear();
          seen.delete(msg.who);
          moved();
          return;
        }
      }
    }),
    // Every time the pipe comes up, and not only the first: whoever is out there answers with
    // everything they have, so a viewer opened late and a viewer that lost the connection are the
    // same case and take the same path.
    link.rx.on("open", () => link.send({ say: "hail" })),
  ];
  link.send({ say: "hail" });

  return {
    // Built on the way out. What lasts is the subject — a panel is remounted when it is a
    // different one and left alone when it is not — and a name is only ever a name.
    list: () =>
      [...seen].map(([who, it]) => ({
        who,
        name: it.name,
        note: it.note,
        subject: it.subject,
      })),
    rx: roster.rx,
    stop: () => {
      for (const it of off) it();
      for (const it of seen.values()) it.said.clear();
      seen.clear();
      roster.clear();
      link.stop();
    },
  };
}

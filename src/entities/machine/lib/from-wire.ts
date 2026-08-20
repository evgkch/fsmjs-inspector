/**
 * Subjects for machines in another tab, process or host, built from wire messages (`model/wire`)
 * over a `Link`. Returns a roster, not one subject: an application publishes several machines.
 *
 * No `drive` — events are not sent to remote machines. `rewind` exists only where the
 * application handed `inspect` a `History`; both are absent rather than refused, and every
 * drawing already checks.
 */
import Channel from "@evgkch/channeljs";
import type { Rx } from "@evgkch/channeljs";
import type { Row } from "../../../shared/lang/rules.js";
import type { Graph, Step } from "../model/graph.js";
import type { Change, Subject } from "../model/subject.js";
import { isWire } from "../model/wire.js";
import type { Kept } from "../model/wire.js";
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
 * A step rebuilt from what was sent. Contexts and payloads cross only when the publisher said
 * `carry`; otherwise they are `undefined`, as in a dumped machine.
 */
const stepOf = (e: Row, at: number, keep?: Kept): Step =>
  ({
    source: { type: e.from, context: undefined },
    input: { type: e.on, payload: keep?.payload },
    target: { type: e.to, context: keep?.context },
    ...(e.emit === undefined
      ? {}
      : { output: { type: e.emit, payload: keep?.emitted } }),
    // The publisher's clock, not the page's.
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

  // The subject is getters over the entry's fields, so a `hello` landing in the entry is on
  // screen at once. What the machine allows is fixed at the hello that made the entry: an
  // application that changes it has called `inspect` again and gets a new entry.
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
      // Where the far end says it stands — not the end of the steps, once walked back.
      get step() {
        return it.pos;
      },
      // `jump` goes up the wire; what comes back is a hello with the whole state restated.
      ...(can.history && {
        rewind: (step: number) => link.send({ say: "jump", who, step }),
      }),
      watch: (on) => it.said.rx.on("moved", (what) => on(what)),
      // Drops this drawing's listeners only; the pipe is the roster's.
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
          // The same machine again (reconnection or restart with the schema unchanged): take its
          // run as restated, keep the panel.
          if (old && old.text === text) {
            old.name = msg.name;
            old.note = msg.note;
            old.at = msg.at;
            old.pos = msg.step;
            old.steps = msg.steps.map((w) => stepOf(w.edge, w.t, w.keep));
            told(old, { say: "restore" });
            return;
          }
          // A different schema under the same name is a different machine and gets a new subject:
          // a figure's lanes, colours and axes are read off the graph once.
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
          it.steps = msg.steps.map((w) => stepOf(w.edge, w.t, w.keep));
          seen.set(msg.who, it);
          moved();
          return;
        }

        case "step": {
          const it = seen.get(msg.who);
          // A step with no graph for it (it beat the hello, or the pipe came back): hail.
          if (!it) return void link.send({ say: "hail" });
          // A step after a walk back drops the redo future, as the far end already has.
          it.steps.length = it.pos;
          it.steps.push(stepOf(msg.went.edge, msg.went.t, msg.went.keep));
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
    // On every (re)connect: a viewer opened late and one that lost the pipe take the same path.
    link.rx.on("open", () => link.send({ say: "hail" })),
  ];
  link.send({ say: "hail" });

  return {
    // Built on the way out; what lasts is the subject.
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

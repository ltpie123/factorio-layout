// The factory floor (bottom strip): every terminal is a flying robot that goes where its
// status sends it. Robots fly: each one's shadow falls on the ground below and to the right.
//   working  hovers at an assembler, welding: the machine's copper gear spins, sparks fly
//   blocked  waits by the lamp under a blinking red alert; the lamp glows red
//   done     hovers over an output chest holding a gear wheel, with a green tick
//   idle     charges on the roboport, patrols, or inspects a quiet machine
// The belt runs the whole time (two lanes of plates, native text frames) and the furnaces
// burn. floormap.js (written by tools/bake_art.py) says where everything stands in floor.png;
// a robot's x is its centre and y its feet. Drag or scroll to pan; double-click recentres.

import { div } from "gpui-kit";
import { run } from "herdr";
import { crew, focusArgs, LABEL, darkness } from "./kit.js";
import { P, pic, glyph, heading } from "./ui.js";
import PLAN from "./floormap.js";

const MAP_W = 2560, MAP_H = 256, CENTRE_X = 1280;
const BOT = 40;
const SHADOW = [14, 24]; // where a flying robot's shadow falls, from its feet

// the assemblers, nearest the centre first
const ASSEMBLERS = [...PLAN.assemblers].sort((a, b) => Math.abs(a + 48 - CENTRE_X) - Math.abs(b + 48 - CENTRE_X));
const [LAMP_X, LAMP_Y] = PLAN.lamp, [PORT_X, PORT_Y] = PLAN.roboport;
const SPOTS = {
  working: ASSEMBLERS.map((x) => [x + 80, 104]),
  blocked: [[LAMP_X - 40, 124], [LAMP_X + 72, 124], [LAMP_X + 16, 210], [LAMP_X - 44, 214], [LAMP_X + 76, 214]],
  done: [...PLAN.chests.map((x) => [x + 16, PLAN.chest_y - 2]), [PLAN.chests[1] + 48, 212]],
};
const PAD = [[PORT_X + 40, PORT_Y + 58], [PORT_X + 88, PORT_Y + 58], [PORT_X + 40, PORT_Y + 100], [PORT_X + 88, PORT_Y + 100]];
const SPEED = 0.12; // px per ms
const ROOM = 48;
const STAY = { charge: [10000, 22000], patrol: [2500, 6000], inspect: [4000, 9000] };
const ACTS = { shell: ["charge", "charge", "patrol", "inspect"], agent: ["patrol", "patrol", "inspect", "charge"] };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

// ---- the belt: two lanes of items moving right, one character per frame ----
const BELT_CHARS = 320;
function lane(pattern) {
  const line = pattern.repeat(Math.ceil(BELT_CHARS / pattern.length) + 1);
  return Array.from({ length: pattern.length }, (_, i) =>
    (line.slice(line.length - i) + line).slice(0, BELT_CHARS));
}
const BELT_Y = PLAN.belt_y;
const LANES = [ // copper plates on the far lane, iron on the near one
  { top: BELT_Y + 1, colour: "#d9803f", frames: lane("■   ■    ■  ") },
  { top: BELT_Y + 11, colour: "#b3c0c6", frames: lane("■  ■   ■     ") },
];
/** Each lane twice, its shadow one pixel down-right; every view shares one frame clock, so
 *  the two stay in step. At night the plates fade toward the dark. */
const belt = (dark) => LANES.flatMap((l) => [[1, "#00000099"], [0, l.colour]].map(([o, colour]) =>
  div().absolute().left(o).top(l.top + o).w(MAP_W).h(18).overflow_hidden()
    .font_family("JetBrains Mono").text_size(14).text_color(colour).whitespace_nowrap()
    .opacity(o ? 1 : 1 - dark * 0.55)
    .frames(l.frames, 70).child(l.frames[0])));

/** Two images swapped fast by opposite clamped opacity loops: a flicker. */
const flicker = (a, b, w, h, period) => [
  pic(a, w, h).absolute().left(0).top(0).loop("opacity", { from: 7, to: -6, period, easing: "linear" }),
  pic(b, w, h).absolute().left(0).top(0).loop("opacity", { from: -6, to: 7, period, easing: "linear" }),
];

/** The selection corners around the focused robot. */
function corners() {
  const c = (l, t, bl, bt) => div().absolute().left(l).top(t).size(10).border_color(P.accent)
    .when(bl, (e) => e.border_l_2()).when(!bl, (e) => e.border_r_2())
    .when(bt, (e) => e.border_t_2()).when(!bt, (e) => e.border_b_2());
  return div().absolute().left(-6).top(-6).w(BOT + 12).h(BOT + 12)
    .loop("opacity", { from: 0.55, to: 1, period: 900 })
    .child(c(0, 0, true, true)).child(c(BOT + 2, 0, false, true))
    .child(c(0, BOT + 2, true, false)).child(c(BOT + 2, BOT + 2, false, false));
}

export default class Floor {
  init(_p, cx) {
    this.w = 0;
    this.h = MAP_H;
    this.pan = { x: 0, y: 0 };
    this.drag = null;
    this.dragged = false;
    this.roam = new Map(); // address -> idle state
    this.taken = []; // spots held by working, waiting and finished robots
    this.dark = darkness();
    cx.timer.every(60_000, (cx) => { const d = darkness(); if (d !== this.dark) { this.dark = d; cx.notify(); } });
    cx.timer.every(1000, (cx) => { if (this.tick(Date.now())) cx.notify(); });
  }

  // ---- idle robots: they fly, so every trip is one straight line ----

  /** No other idle robot aims here, and no working, waiting or finished one stands here. */
  free([x, y], self) {
    const near = ([ax, ay]) => Math.hypot(ax - x, ay - y) < ROOM;
    return ![...this.roam].some(([a, s]) => a !== self && near([s.x, s.y])) && !this.taken.some(near);
  }

  place(u, act, busy) {
    if (act === "charge") return PAD.find((p) => this.free(p, u.address)) ?? null;
    if (act === "inspect") {
      const quiet = ASSEMBLERS.filter((x) => !busy.has(x)).map((x) => [x + 48 + rnd(-24, 24), rnd(64, 104)]);
      const open = quiet.filter((p) => this.free(p, u.address));
      return open.length ? pick(open) : null;
    }
    for (let i = 0; i < 12; i++) {
      const p = [rnd(140, 2420), pick([rnd(206, 226), rnd(136, 150)])];
      if (this.free(p, u.address)) return p;
    }
    return null;
  }

  tick(now) {
    const all = crew();
    const idle = all.filter((u) => u.status === "idle");
    const busy = new Set(ASSEMBLERS.slice(0, all.filter((u) => u.status === "working").length));
    this.taken = ["working", "blocked", "done"].flatMap((st) =>
      SPOTS[st].slice(0, all.filter((u) => u.status === st).length));
    let changed = false;
    for (const a of this.roam.keys()) if (!idle.some((u) => u.address === a)) { this.roam.delete(a); changed = true; }
    for (const u of idle) {
      let s = this.roam.get(u.address);
      if (!s) {
        const [x, y] = this.place(u, "charge", busy) ?? this.place(u, "patrol", busy) ?? PAD[0];
        s = { x, y, act: "charge", face: "", moveMs: 1500, until: now + rnd(2000, 8000) };
        this.roam.set(u.address, s);
        changed = true;
      }
      if (now < s.until) continue;
      let act = pick(ACTS[u.shell ? "shell" : "agent"]), to = this.place(u, act, busy);
      if (!to) { act = "patrol"; to = this.place(u, act, busy); }
      if (!to) { s.until = now + 3000; continue; }
      const dx = to[0] - s.x, dist = Math.hypot(dx, to[1] - s.y);
      if (Math.abs(dx) > 4) s.face = dx > 0 ? "" : "l";
      s.moveMs = Math.min(15000, Math.max(400, dist / SPEED));
      [s.x, s.y] = to;
      s.act = act;
      s.until = now + s.moveMs + rnd(...STAY[act]);
      changed = true;
    }
    return changed;
  }

  // ---- drawing ----

  focus(u) {
    if (!this.dragged) run(...focusArgs(u));
  }

  robot(u, x, y, { face = "", move = 1500, extras = [] } = {}) {
    const tip = `${u.bot.name} · ${u.bot.prog} · ${u.spaceName} / ${u.tabName} · ${LABEL[u.status]}`;
    const policy = { duration: move, easing: "ease-in-out" };
    const bob = u.status === "working" ? 500 : u.status === "idle" ? 1600 : 1100;
    return div().id(`bot-${u.address}`).absolute().left(x - BOT / 2).top(y - BOT).w(BOT).h(BOT).cursor_pointer()
      .transition("left", policy).transition("top", policy)
      .tooltip(tip)
      .on_click(() => this.focus(u))
      .child(div().absolute().left(BOT / 2 - 11 + SHADOW[0]).top(BOT - 5 + SHADOW[1]).w(22).h(9).rounded_full().bg("#1e0e0466")
        .loop("left", { from: BOT / 2 - 12 + SHADOW[0], to: BOT / 2 - 9 + SHADOW[0], period: bob }))
      .child(pic(`bot-${u.bot.colour}${face ? `-${face}` : ""}${this.dark >= 0.5 ? "-night" : ""}`, BOT, BOT).absolute().left(0)
        .loop("top", { from: 0, to: -4, period: bob }))
      .children(extras)
      .when(u.focused, (el) => el.child(corners()));
  }

  worker(u, [x, y]) {
    const sparks = div().absolute().left(BOT / 2 - 9).top(-14).size(18).children(flicker("spark-a", "spark-b", 18, 18, 160));
    return this.robot(u, x, y, { extras: [sparks] });
  }

  waiting(u, [x, y]) {
    return this.robot(u, x, y, { extras: [
      pic("alert-red", 24, 24).absolute().left(BOT / 2 - 12).top(-24).loop("opacity", { from: 0.2, to: 1, period: 520 }),
    ] });
  }

  finished(u, [x, y]) {
    return this.robot(u, x, y, { extras: [
      pic("item", 24, 24).absolute().left(BOT / 2 - 12).top(BOT - 10),
      pic("tick", 16, 16).absolute().left(BOT - 10).top(-8).loop("opacity", { from: 0.3, to: 1, period: 900 }),
    ] });
  }

  idler(u, s) {
    const extras = s.act === "charge" ? [pic("battery", 22, 12).absolute().left(BOT / 2 - 11).top(-12)
      .loop("opacity", { from: 0.3, to: 1, period: 1800 })] : [];
    return this.robot(u, s.x, s.y, { face: s.face, move: s.moveMs, extras });
  }

  /** A crafting assembler: copper gears spin in both wells and its status light turns green. */
  machine(x) {
    const y = PLAN.assembler_y;
    const copper = this.dark >= 0.5 ? "#6a4426" : "#c27a3a";
    return [
      div().absolute().left(x + 31).top(y + 37).size(30).child(glyph("gear", 30, copper).spin(2400)),
      div().absolute().left(x + 62).top(y + 22).size(16).child(glyph("gear", 16, copper).spin(1100)),
      div().absolute().left(x + 73).top(y + 76).w(6).h(3).bg("#8cf070").loop("opacity", { from: 0.4, to: 1, period: 700 }),
    ];
  }

  /** Night: the lit floor fades in over the day one, and every lamp's lens glows. */
  nightfall() {
    if (!this.dark) return [];
    return [
      pic("floor-night", MAP_W, MAP_H).absolute().left(0).top(0).opacity(this.dark),
      ...PLAN.lamps.map(([x, y]) => pic("glow-lamp", 48, 48).absolute().left(x - 8).top(y - 14).opacity(this.dark)),
    ];
  }

  /** Furnaces always burn: two glows out of step make the fire flicker. */
  fires() {
    return PLAN.furnaces.flatMap(([x, y]) => [
      pic("glow-fire", 64, 64).absolute().left(x).top(y + 18).loop("opacity", { from: 0.45, to: 0.9, period: 620 }),
      pic("glow-fire", 40, 40).absolute().left(x + 12).top(y + 32).loop("opacity", { from: 0.9, to: 0.3, period: 410 }),
    ]);
  }

  more(n, [x, y]) {
    return div().absolute().left(x - 20).top(y - 24).px(6).py(1).rounded(2).bg(P.frame).border_1().border_color(P.accent)
      .child(heading(`+${n}`, 14, P.accent));
  }

  // ---- panning ----

  bounds() {
    const left = this.w / 2 - CENTRE_X, top = (this.h - MAP_H) / 2;
    return {
      left: this.w >= MAP_W ? (this.w - MAP_W) / 2 : Math.min(0, Math.max(this.w - MAP_W, left + this.pan.x)),
      top: this.h >= MAP_H ? top : Math.min(0, Math.max(this.h - MAP_H, top + this.pan.y)),
      base: { left, top },
    };
  }

  panTo(x, y) {
    this.pan = { x, y };
    const b = this.bounds();
    this.pan = { x: b.left - b.base.left, y: this.h >= MAP_H ? 0 : b.top - b.base.top };
  }

  render(_cx) {
    this.dark = darkness(); // the sky button changes it between the minute ticks
    this.tick(Date.now()); // a robot that just went idle gets its state now, not a second later
    const all = crew();
    const out = []; // [bottom y, element]: drawn back to front
    const fixed = [];
    const draw = { working: this.worker, blocked: this.waiting, done: this.finished };
    for (const st of ["working", "blocked", "done"]) {
      const us = all.filter((u) => u.status === st), spots = SPOTS[st];
      us.slice(0, spots.length).forEach((u, i) => {
        out.push([spots[i][1], draw[st].call(this, u, spots[i])]);
        if (st === "working") fixed.push(...this.machine(ASSEMBLERS[i]));
      });
      if (us.length > spots.length) out.push([999, this.more(us.length - spots.length, spots[spots.length - 1])]);
    }
    if (all.some((u) => u.status === "blocked")) {
      fixed.push(pic("glow-red", 96, 96).absolute().left(LAMP_X - 32).top(LAMP_Y - 40)
        .loop("opacity", { from: 0.15, to: 1, period: 520 }));
    }
    for (const u of all) {
      const s = u.status === "idle" ? this.roam.get(u.address) : null;
      if (s) out.push([s.y, this.idler(u, s)]);
    }
    out.sort((a, b) => a[0] - b[0]);
    const { left, top } = this.bounds();
    return div().id("floor").size_full().relative().overflow_hidden().bg("#94642f")
      .on_size_change((s, cx) => { if (s.width !== this.w || s.height !== this.h) { this.w = s.width; this.h = s.height; cx.notify(); } })
      .on_scroll_wheel((e, cx) => {
        const d = Math.abs(e.delta.x) > Math.abs(e.delta.y) ? e.delta.x : e.delta.y;
        this.panTo(this.pan.x + d, this.pan.y);
        cx.notify();
      })
      .on_mouse_down("left", (e, cx) => {
        this.dragged = false;
        if (e.click_count === 2) { this.panTo(0, 0); cx.notify(); return; }
        this.drag = { x: e.position.x, y: e.position.y, pan: { ...this.pan } };
      })
      .on_mouse_move((e, cx) => {
        if (!this.drag) return;
        const dx = e.position.x - this.drag.x, dy = e.position.y - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.dragged = true;
        if (!this.dragged) return;
        this.panTo(this.drag.pan.x + dx, this.drag.pan.y + dy);
        cx.notify();
      })
      .on_mouse_up("left", () => { this.drag = null; })
      .on_hover((h) => { if (!h) this.drag = null; })
      .child(div().absolute().left(left).top(top).w(MAP_W).h(MAP_H)
        .child(pic("floor", MAP_W, MAP_H).absolute().left(0).top(0))
        .children(this.nightfall())
        .children(belt(this.dark))
        .children(this.fires())
        .children(fixed)
        .children(out.map(([, el]) => el)));
  }
}


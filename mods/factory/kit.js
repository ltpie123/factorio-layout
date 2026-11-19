// Factory Floor: who is who. Every terminal is a hovering robot whose colour comes from its
// program (claude orange, codex teal, gemini blue, opencode green, pi purple, shells grey,
// other agents yellow) and whose serial number comes from a hash of its address.

import { focused, panes, spaces, terminals, shared, setShared } from "herdr";
import PLAN from "./floormap.js";

export const ART = PLAN.art; // a new folder per bake (tools/bake_art.py)

const COLOUR_OF = [
  [/claude/, "orange"], [/codex/, "teal"], [/gemini/, "blue"], [/opencode/, "green"],
  [/^(pi|omp)\b|oh-my-pi/, "purple"],
];

export function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** A shell that reports a status is running an agent the program table can't name: yellow. */
export function colourOf(program, app, agent = false) {
  const k = `${app ?? ""} ${program?.key ?? ""}`.toLowerCase().trim();
  for (const [re, c] of COLOUR_OF) if (re.test(k)) return c;
  return program?.shell && !agent ? "grey" : "yellow";
}

/** A robot's sprite: kind "" (facing right), "l" (facing left) or "big" (the info card). */
export const botArt = (colour, kind = "") => `${ART}/bot-${colour}${kind ? `-${kind}` : ""}.png`;

const crafted = (address) => Number(terminals().find((x) => x.address === address)?.turn) || 0;

export function botOf(address, program, app, agent = false) {
  const colour = colourOf(program, app, agent);
  const serial = hash(address).toString(16).slice(-4).toUpperCase().padStart(4, "0");
  return { colour, serial, name: `${program?.shell && !agent ? "Utility" : "Assembler"} bot #${serial}`, crafted: crafted(address), prog: program?.name ?? "?" };
}

/** Every terminal with a robot: agents (they report a status) and plain shells, which idle. */
export function crew() {
  const where = new Map();
  for (const s of spaces()) for (const t of s.tabs) where.set(t.id, { space: s, tab: t });
  const now = focused()?.terminal ?? null;
  return panes()
    .filter((p) => p.terminal && (p.status || p.program?.shell))
    .map((p) => {
      const w = where.get(p.tab);
      return {
        address: p.terminal, pane: p.pane, tab: p.tab, space: w?.space.id ?? null,
        spaceName: w?.space.name ?? "", tabName: w?.tab.name ?? "",
        status: p.status ?? "idle", agent: Boolean(p.status), focused: p.terminal === now,
        title: p.title, cwd: p.cwd, branch: p.branch, shell: Boolean(p.program?.shell),
        bot: botOf(p.terminal, p.program, p.app, Boolean(p.status)),
      };
    });
}

/** Focus a robot's terminal: agent order for agents, the pane for shells. */
export const focusArgs = (u) => (u.agent ? ["agent.focus", { terminal: u.address }] : ["pane.focus", { pane: u.pane }]);

export const LABEL = { working: "Crafting", blocked: "Needs input!", done: "Output ready", idle: "Idle" };

export function folder(cwd) {
  if (!cwd) return "";
  const parts = cwd.replace(/\/+$/, "").split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : cwd;
}

export const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// The sky: "auto" follows the clock, "night" and "day" pin it (the bar's button, ctrl-shift-n).
const SKY_KEY = "factory.sky";
export const SKIES = ["auto", "night", "day"];
export const sky = () => (SKIES.includes(shared(SKY_KEY)) ? shared(SKY_KEY) : "auto");
export const nextSky = () => setShared(SKY_KEY, SKIES[(SKIES.indexOf(sky()) + 1) % SKIES.length]);

/** How dark it is, 0 (day) to 1 (night): dark 20:00-05:30, dusk 18-20, dawn 05:30-07:00. */
export function darkness(d = new Date()) {
  if (sky() !== "auto") return sky() === "night" ? 1 : 0;
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 20 || h < 5.5) return 1;
  if (h >= 18) return (h - 18) / 2;
  if (h < 7) return 1 - (h - 5.5) / 1.5;
  return 0;
}

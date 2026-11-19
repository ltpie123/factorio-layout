// The top bar (window drag): a game window title bar. Gear, "FACTORY FLOOR", the striped drag
// filler, counts by status (alerts jumps to the next robot that needs input), the shown
// factory and line, the clock, and window buttons where the system draws none.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, nextCommand, window as appWindow } from "herdr";
import { crew, focusArgs, hhmm, sky, nextSky, darkness } from "./kit.js";
import { P, txt, heading, glyph, pic, filler, frame, tool, button } from "./ui.js";

export default class Bar {
  init(_p, cx) {
    this.now = new Date();
    cx.timer.every(30_000, (cx) => { this.now = new Date(); cx.notify(); });
    // keys.json: "ctrl-shift-g": "factory.sky"
    cx.spawn(async () => {
      for (;;) if ((await nextCommand()) === "sky") nextSky();
    });
  }

  count(id, icon, n, label, color, onClick, tip) {
    let el = h_flex().id(id).flex_none().h(26).px(8).gap(6).items_center().rounded(2).bg(P.inset)
      .border_1().border_color(P.frameLo).border_l_4()
      .child(icon).child(txt(label, 14, n ? P.text : P.soft, 700));
    if (onClick) {
      el = el.cursor_pointer().hover((s) => s.bg(P.rowHover)).tooltip(tip)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(onClick);
    }
    return el.border_color(color);
  }

  render(_cx) {
    const all = crew();
    const n = (st) => all.filter((u) => u.status === st).length;
    const blocked = all.filter((u) => u.status === "blocked");
    const sp = spaces().find((s) => s.active);
    const tab = sp?.tabs.find((x) => x.active);
    const win = appWindow();
    const where = sp ? `${sp.name}${tab ? `  ·  Line ${tab.index}${tab.named ? `: ${tab.name}` : ""}` : ""}` : "";
    const nextBlocked = () => {
      if (!blocked.length) return;
      const i = blocked.findIndex((u) => u.focused);
      run(...focusArgs(blocked[(i + 1) % blocked.length]));
    };

    return frame(h_flex().size_full().px(10).gap(10).items_center())
      .child(glyph("gear", 22, P.accent).spin(n("working") ? 3000 : 600000))
      .child(heading("FACTORY FLOOR", 18))
      .child(filler(12))
      .child(this.count("c-working", div().size(10).rounded(1).bg(P.working), n("working"), `${n("working")} crafting`, P.working))
      .child(this.count("c-blocked", pic("alert-red", 16, 16), n("blocked"), `${n("blocked")} need input`, P.blocked,
        blocked.length ? nextBlocked : null, "Go to the next robot that needs input"))
      .child(this.count("c-done", pic("tick", 14, 14), n("done"), `${n("done")} ready`, P.done))
      .child(filler(12))
      .child(txt(where, 15, P.heading, 600).flex_none().max_w(420).truncate())
      .child(button("sky", txt(`${darkness() >= 0.5 ? "☾" : "☀"} ${sky() === "auto" ? "Auto" : sky() === "night" ? "Night" : "Day"}`, 14, P.buttonInk, 700),
        nextSky, "Sky: follow the clock, always night, or always day (ctrl-shift-g)", { h: 24 }))
      .child(heading(hhmm(this.now), 18, P.text))
      .when(Boolean(win?.buttons), (el) => el.child(h_flex().flex_none().gap(4).pl(6)
        .child(tool("w-min", "min", () => run("window.minimize"), "Minimize"))
        .child(tool("w-max", "max", () => run("window.maximize"), "Maximize"))
        .child(tool("w-close", "close", () => run("window.close"), "Close window", true))));
  }
}

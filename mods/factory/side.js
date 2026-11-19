// The left column: factories (spaces) and their assembly lines (tabs), each line with the
// robots in it; below, the entity info card of the focused robot: big sprite, status,
// a crafting progress bar while it works, items crafted (its turns), folder and title.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, run } from "herdr";
import { crew, focusArgs, folder, LABEL } from "./kit.js";
import { P, txt, heading, pic, frame, inset, button, progress } from "./ui.js";

export default class Side {
  init() {}

  line(sp, tab, members) {
    const sel = sp.active && tab.active;
    const name = `Line ${tab.index}${tab.named ? `: ${tab.name}` : ""}`;
    return h_flex().id(`line-${tab.id}`).h(30).px(6).gap(6).items_center().rounded(2).cursor_pointer()
      .bg(sel ? P.pick : P.row)
      .border_1().border_color(sel ? P.accent : P.frameLo)
      .hover((s) => s.bg(sel ? P.pick : P.rowHover))
      .tooltip(name)
      .on_click(() => run("tab.select", { id: tab.id }))
      .child(div().size(8).rounded(1).flex_none().bg(tab.status ? P[tab.status] ?? P.idle : P.frameLo)
        .when(tab.status === "blocked", (d) => d.loop("opacity", { from: 0.3, to: 1, period: 520 })))
      .child(txt(name, 14, sel ? P.heading : P.text, sel ? 700 : 400).flex_1().min_w(0).truncate())
      .child(h_flex().flex_none().gap(1).children(members.slice(0, 4).map((u) => pic(`bot-${u.bot.colour}`, 24, 24))));
  }

  factory(sp, all) {
    return inset(v_flex().id(`factory-${sp.id}`).p(6).gap(3))
      .child(h_flex().id(`factory-head-${sp.id}`).gap(6).items_center().pb(2).cursor_pointer()
        .tooltip(sp.name)
        .on_click(() => run("space.select", { id: sp.id }))
        .child(heading(sp.name, 15, sp.active ? P.accent : P.heading).flex_1().min_w(0).truncate())
        .when(Boolean(sp.branch), (el) => el.child(txt(`⎇ ${sp.branch}`, 13, P.soft).flex_none().max_w(110).truncate().tooltip(sp.branch))))
      .children(sp.tabs.map((tab) => this.line(sp, tab, all.filter((u) => u.tab === tab.id))));
  }

  /** An inventory slot: dark, sunken, an item with its count in the bottom-right corner. */
  slot(icon, count, tip) {
    return div().id(`slot-${tip}`).relative().size(40).flex_none().rounded(3).bg("#1f1e1f")
      .border_1().border_color("#4a494a").tooltip(tip)
      .child(div().absolute().left(0).top(0).right(0).h(3).bg("#141314"))
      .child(pic(icon, 32, 32).absolute().left(4).top(4))
      .child(txt(count, 13, "#ffffff", 700).absolute().right(3).bottom(0));
  }

  card(u) {
    const body = frame(v_flex().id("card").h(286).p(8).gap(6));
    if (!u) return body.items_center().justify_center().child(txt("No robot selected", 14, P.soft));
    const status = h_flex().gap(6).items_center()
      .child(div().size(9).rounded_full().bg(P[u.status] ?? P.idle)
        .when(u.status === "blocked", (d) => d.loop("opacity", { from: 0.25, to: 1, period: 520 })))
      .child(txt(LABEL[u.status], 14, P.text, 600));
    return body
      .child(h_flex().gap(6).items_center()
        .child(heading(u.bot.name, 15).flex_1().min_w(0).truncate()))
      .child(status)
      .child(inset(div().h(124).relative().overflow_hidden())
        .child(pic("checker", 320, 160).absolute().left(0).top(0))
        .child(div().absolute().left(0).right(0).top(0).bottom(0).flex().items_center().justify_center()
          .child(pic(`bot-${u.bot.colour}-big`, 104, 104).loop("top", { from: -2, to: -8, period: 1400 }))))
      .child(div().h(14).relative().rounded(2).bg("#1b1a1b").border_1().border_color("#4a494a").overflow_hidden()
        .when(u.status === "working", (el) => el.child(progress(30).absolute().left(3).top(-2))))
      .child(h_flex().gap(6).items_center()
        .child(this.slot("item-slot", u.bot.crafted, "Turns taken"))
        .child(v_flex().flex_1().min_w(0)
          .child(txt(u.bot.prog, 14, P.text, 600).truncate())
          .child(txt(`${folder(u.cwd)}${u.title ? `  ·  ${u.title}` : ""}`, 13, P.soft).truncate()
            .tooltip(`${u.cwd ?? ""}\n${u.title ?? ""}`)))
        .child(button("card-go", txt("Go", 14, P.buttonInk, 700), () => run(...focusArgs(u)), "Focus this terminal", { tone: "confirm" })));
  }

  render(_cx) {
    const all = crew();
    const sps = spaces();
    return frame(v_flex().size_full().gap(6).p(6))
      .child(h_flex().gap(6).items_center().h(26)
        .child(heading("Factories", 16))
        .child(div().flex_1())
        .child(button("new-line", txt("+ Line", 14, P.buttonInk, 700), () => run("tab.new"), "Open a new tab in this factory"))
        .child(button("new-factory", txt("+ Factory", 14, P.buttonInk, 700), () => run("space.new"), "Open a new space")))
      .child(v_flex().id("factories").flex_1().min_h(0).gap(6).overflow_y_scroll()
        .when(!sps.length, (el) => el.child(txt("No factories yet", 14, P.soft)))
        .children(sps.map((sp) => this.factory(sp, all))))
      .child(this.card(all.find((u) => u.focused) ?? null));
  }
}

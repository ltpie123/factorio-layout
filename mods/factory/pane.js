// A pane's header: a dark title strip with the robot working in it, its program and status,
// the folder and branch, and split, zoom and close tool buttons. The focused pane's strip has
// an orange edge.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run } from "herdr";
import { botOf, folder, LABEL } from "./kit.js";
import { P, txt, heading, pic, tool, lamp } from "./ui.js";

export default class PaneHead {
  init() {}

  render(_cx) {
    const me = props()?.pane;
    const p = panes().find((x) => x.pane === me);
    if (!p) return div().size_full().bg(P.frame);
    const b = p.terminal && (p.status || p.program?.shell) ? botOf(p.terminal, p.program, p.app, Boolean(p.status)) : null;
    const btn = (g, cmd, args, tip, danger) => tool(`${g}-${me}`, g, () => run(cmd, { pane: me, ...args }), tip, danger);
    const where = `${folder(p.cwd)}${p.branch ? `  ⎇ ${p.branch}` : ""}`;
    return h_flex().id(`head-${me}`).size_full().relative().pl(8).pr(4).gap(8).items_center().overflow_hidden()
      .bg(p.focused ? P.frame : P.inset)
      .on_click(() => run("pane.focus", { pane: me }))
      .child(div().absolute().left(0).top(0).bottom(0).w(3).bg(p.focused ? P.accent : P.frameLo))
      .child(div().absolute().left(0).right(0).bottom(0).h(1).bg(P.frameLo))
      .when(Boolean(b), (el) => el
        .child(pic(`bot-${b.colour}`, 24, 24))
        .child(heading(b.name, 14, p.focused ? P.heading : P.text).flex_none())
        .child(txt(b.prog, 13, P.soft, 600).flex_none()))
      .when(!b, (el) => el.child(heading(p.title, 14).flex_none().max_w(260).truncate().tooltip(p.title ?? "")))
      .when(Boolean(p.status), (el) => el.child(lamp(p.status, LABEL[p.status])))
      .child(txt(where, 13, P.soft).flex_1().min_w(0).truncate().tooltip(p.cwd ?? ""))
      .child(h_flex().flex_none().gap(3)
        .child(btn("split-r", "pane.split", { direction: "right" }, "Split right"))
        .child(btn("split-d", "pane.split", { direction: "down" }, "Split down"))
        .child(btn("zoom", "pane.zoom", {}, "Zoom pane"))
        .child(btn("close", "pane.close", {}, "Close pane", true)));
  }
}

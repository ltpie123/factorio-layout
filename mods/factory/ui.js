// Factory Floor: the interface kit, drawn like an industrial game GUI: charcoal frames with a
// bevel (light top-left, dark bottom-right), darker inset panels, cream bold headings, light
// grey buttons that turn orange on hover.

import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { ART } from "./kit.js";

export const FONT = "Titillium Web";

export const P = {
  frame: "#313031", frameHi: "#4a494a", frameLo: "#1b1a1b",
  inset: "#242324", insetLo: "#141314", row: "#2c2b2c", rowHover: "#3a393a",
  heading: "#ffe6c0", text: "#e8e2d6", soft: "#a9a39a",
  accent: "#ff9f1c", accentDark: "#b86a0c", pick: "#4a3a1f",
  button: "#8e8e8e", buttonHi: "#b4b4b4", buttonLo: "#5c5b5c", buttonInk: "#161616",
  working: "#5eb663", blocked: "#fe5a5a", done: "#ffcc33", idle: "#8e8e8e",
};

export const pic = (name, w, h) => image(`${ART}/${name}.png`).w(w).h(h).flex_none();
export const glyph = (name, size, color) => svg(`${ART}/${name}.svg`).size(size).flex_none().text_color(color);

export const txt = (s, size = 15, color = P.text, weight = 400) =>
  div().font_family(FONT).font_weight(weight).text_size(size).text_color(color).child(String(s ?? ""));

export const heading = (s, size = 16, color = P.heading) => txt(s, size, color, 700).whitespace_nowrap();

/** A raised frame: dark outer line, a light line along the top and left. */
export function frame(el, bg = P.frame) {
  return el.relative().bg(bg).border_1().border_color(P.frameLo)
    .child(div().absolute().left(0).right(0).top(0).h(1).bg(P.frameHi))
    .child(div().absolute().left(0).top(0).bottom(0).w(1).bg(P.frameHi));
}

/** A sunken panel: the shadow along the top and left. */
export function inset(el, bg = P.inset) {
  return el.relative().bg(bg).border_1().border_color(P.frameHi)
    .child(div().absolute().left(0).right(0).top(0).h(2).bg(P.insetLo))
    .child(div().absolute().left(0).top(0).bottom(0).w(2).bg(P.insetLo));
}

/** The striped drag filler that fills a title bar's spare width. */
export const filler = (h = 12) => div().flex_1().min_w(16).h(h).overflow_hidden().relative()
  .child(pic("handle", 800, h).absolute().left(0).top(0));

/** A light grey game button with dark text; orange on hover, darker when pressed. */
export function button(id, content, onClick, tip, { h = 26, tone = "plain" } = {}) {
  const face = tone === "confirm" ? P.working : tone === "danger" ? "#c8473f" : P.button;
  return h_flex().id(id).flex_none().h(h).px(10).gap(5).items_center().justify_center().cursor_pointer()
    .bg(face).border_1().border_color(P.frameLo).rounded(2)
    .border_t_1()
    .hover((s) => s.bg(P.accent))
    .active((s) => s.bg(P.accentDark))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .tooltip(tip)
    .children(Array.isArray(content) ? content : [content])
    .on_click(onClick);
}

/** A small dark square tool button with a glyph (pane and window controls). */
export function tool(id, name, onClick, tip, danger = false) {
  return div().id(id).flex_none().size(22).flex().items_center().justify_center().cursor_pointer()
    .bg(P.row).border_1().border_color(P.frameLo).rounded(2)
    .hover((s) => s.bg(danger ? "#c8473f" : P.accent))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .tooltip(tip)
    .child(glyph(name, 14, P.text))
    .on_click(onClick);
}

/** A status lamp and word; "needs input" blinks. */
export function lamp(status, label) {
  const c = P[status] ?? P.idle;
  let dot = div().size(8).rounded(1).bg(c).flex_none().border_1().border_color(P.frameLo);
  if (status === "blocked") dot = dot.loop("opacity", { from: 0.25, to: 1, period: 520 });
  return h_flex().flex_none().gap(5).items_center().px(6).h(18).rounded(2).bg(`${c}22`)
    .child(dot).child(txt(label, 13, c, 700));
}

/** A crafting progress bar: block characters that fill up, then start over (native frames). */
export function progress(width = 14) {
  const steps = Array.from({ length: width + 1 }, (_, i) => "▰".repeat(i) + "▱".repeat(width - i));
  return div().font_family("JetBrains Mono").text_size(11).text_color(P.working).frames(steps, 140);
}

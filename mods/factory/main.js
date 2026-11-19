// Factory Floor: an industrial-game skin for Herdr. One mod, a role per block (props.role):
//   bar    the title bar      side  factories, lines and the entity card
//   floor  the factory strip  pane  a pane's header (props.pane)

import { View, div } from "gpui-kit";
import { props } from "herdr";
import Bar from "./bar.js";
import Side from "./side.js";
import Floor from "./floor.js";
import PaneHead from "./pane.js";
import { usePalette } from "./ui.js";

const ROLES = { bar: Bar, side: Side, floor: Floor, pane: PaneHead };

export default class Factory extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role] ?? (pr.pane ? PaneHead : null);
    // no role (herdr-app check): every role at once, so the check covers them all
    this.parts = (R ? [R] : Object.values(ROLES)).map((K) => { const r = new K(); r.init(pr, cx); return r; });
    this.single = Boolean(R);
  }

  render(cx) {
    usePalette();
    if (this.single) return this.parts[0].render(cx);
    return div().flex().flex_col().size_full().children(this.parts.map((r) => div().h(260).child(r.render(cx))));
  }
}

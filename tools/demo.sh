#!/bin/sh
# Fills the floor with stand-in agents, to see every status without running real ones.
#
#   tools/demo.sh        open a "demo-factory" space with stand-in agents
#   tools/demo.sh stop   close it
#
# Herdr names a terminal's program after its foreground process, so each stand-in reports its
# status with OSC 7501 (as real agents do) and then becomes a copy of `sleep` named like the
# agent it plays.
set -eu

NAME=demo-factory
BIN=${TMPDIR:-/tmp}/factory-floor-demo
if [ "${1:-}" = stop ]; then
  id=$(herdr-app ls | jq -r --arg n "$NAME" '.. | objects | select(.name? == $n and has("tabs")) | .id' | head -1)
  [ -n "$id" ] && herdr-app do space.close "{\"id\":\"$id\",\"confirmed\":true}" >/dev/null
  exit 0
fi

mkdir -p "$BIN/as"
for a in claude codex gemini opencode; do [ -x "$BIN/as/$a" ] || cp "$(command -v sleep)" "$BIN/as/$a"; done
cat >"$BIN/report" <<SCRIPT
#!/bin/sh
[ "\$2" = done ] && printf '\033]7501;state=working\007' && sleep 3
printf '\033]7501;state=%s\007' "\$2"
printf '%s (stand-in): %s\n' "\$1" "\$2"
exec "$BIN/as/\$1" infinity
SCRIPT
chmod +x "$BIN/report"

tab() { # name, agent, status
  herdr-app do tab.new "{\"space\":\"$sp\",\"name\":\"$1\",\"argv\":[\"$BIN/report\",\"$2\",\"$3\"]}" >/dev/null
}

sp=$(herdr-app do space.new "{\"name\":\"$NAME\",\"tab\":\"api\",\"argv\":[\"$BIN/report\",\"claude\",\"working\"]}" | jq -r .space)
tab docs codex working
tab review opencode working
tab refactor gemini working
tab login claude blocked
tab deploy gemini done
tab tests opencode idle
tab lint codex idle
echo "demo space: $sp (tools/demo.sh stop closes it)"

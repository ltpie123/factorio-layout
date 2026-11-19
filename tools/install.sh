#!/bin/sh
# Install (or update) Factory Floor into the Herdr app's home. The art is committed; rebake it
# with tools/bake_art.py only after changing the drawing code.
# Herdr loads images and reloads mods only from real files inside its home, so this copies.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
DEST=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
[ -d "$DEST" ] || { echo "Herdr home not found: $DEST (start the Herdr app once first)" >&2; exit 1; }
mkdir -p "$DEST/mods" "$DEST/layouts" "$DEST/themes"
rsync -a --delete "$REPO/mods/factory/" "$DEST/mods/factory/"
rsync -a "$REPO/layouts/Factory.json" "$REPO/layouts/Factory.png" "$DEST/layouts/"
rsync -a "$REPO/themes/Factory.json" "$DEST/themes/"
herdr-app check "$DEST/mods/factory"
echo "Installed. Switch to it: herdr-app do layout.switch '{\"name\":\"Factory\"}'"

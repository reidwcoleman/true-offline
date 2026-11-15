#!/bin/zsh
# Starts the True Offline studio and opens it. Close this window (or press Ctrl C) to stop it.
cd "${0:A:h}"
PY=/opt/homebrew/bin/python3
[ -x "$PY" ] || PY=python3
(sleep 1.2 && open "http://localhost:${STUDIO_PORT:-4781}") &
exec "$PY" tools/studio/server.py

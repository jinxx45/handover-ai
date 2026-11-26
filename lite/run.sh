#!/bin/sh
# Starts the agent (:8000) and the backend + UI (:8080). No installs needed: Python 3 and Node 18+.
cd "$(dirname "$0")"
python3 agent/server.py &
AGENT=$!
trap 'kill $AGENT' EXIT INT TERM
node backend/src/server.js

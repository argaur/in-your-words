#!/usr/bin/env bash
# Gaurav's local run: keys piped from gopass into this process only, never written to a file.
#   npm run local     then open http://localhost:3000/run
set -euo pipefail
GOPASS="/c/Users/Gaurav Gupta/AppData/Local/gopass/gopass.exe"
NEBIUS_API_KEY="$("$GOPASS" show -o voice-proof-desk/NEBIUS_API_KEY)"
TAVILY_API_KEY="$("$GOPASS" show -o voice-proof-desk/TAVILY_API_KEY)"
export NEBIUS_API_KEY TAVILY_API_KEY
export LOCAL_RUN_LOG=1 NEXT_PUBLIC_LOCAL_RUN_LOG=1
exec npx next dev "$@"

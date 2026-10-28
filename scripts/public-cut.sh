#!/usr/bin/env bash
# Builds the public repo as one fresh commit from HEAD, leaves out the planning docs, and
# leak-scans the result. Never pushes. Gaurav, 2026-10-26: code and user docs only.
#   bash scripts/public-cut.sh <empty target dir>
set -euo pipefail

TARGET="${1:?usage: bash scripts/public-cut.sh <empty target dir>}"
if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET")" ]; then
  echo "target is not empty: $TARGET" >&2
  exit 1
fi
mkdir -p "$TARGET"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "commit your changes first: the cut is taken from HEAD" >&2
  exit 1
fi

# Planning docs hold real target companies and story lines (leak-scan-all, 2026-10-26).
git archive --format=tar HEAD -- . \
  ':(exclude)Documentation' \
  ':(exclude)PRD.md' \
  ':(exclude)CLAUDE.md' \
  ':(exclude)AGENTS.md' \
  ':(exclude).claude' \
  ':(exclude)NEEDS-YOU.md' \
  ':(exclude)PRODUCT.md' \
  ':(exclude)hours.json' \
  ':(exclude)hours-measured.json' \
  ':(exclude)video/BRIEF.md' \
  ':(exclude)video/STORYBOARD.md' \
  ':(exclude)video/STYLE.md' \
  ':(exclude)video/QA.md' \
  ':(exclude)scripts/*.starter' \
  | tar -x -C "$TARGET"

# Scan the cut with the same needles as the deploy scan. The needles are local, so it runs from here.
npx tsx scripts/leak-scan-all.ts --dir "$TARGET"

# Code comments may name the private docs. A reader-facing link to one would be a dead end.
if grep -rIl --include="*.md" "Documentation/\|PRD\.md" "$TARGET"; then
  echo "the docs above link to left-out files" >&2
  exit 1
fi

git -C "$TARGET" init -q -b main
git -C "$TARGET" add -A
git -C "$TARGET" commit -q -m "In Your Words: job applications in your own words, with proof for every line"
echo "public cut ready: $TARGET ($(git -C "$TARGET" ls-files | wc -l) files, 1 commit)"

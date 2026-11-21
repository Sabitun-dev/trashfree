#!/bin/sh
# Commit only when typecheck, tests and build are all green.
set -e
npm run check > .check.log 2>&1 || { tail -40 .check.log; echo "CHECK FAILED — not committing"; exit 1; }
grep -E "Tests |gzip" .check.log | tail -8
git add -A
git -c user.email=sbtxnabdullayev@gmail.com -c user.name="Trashfree" commit -q "$@"
git log --oneline | head -1

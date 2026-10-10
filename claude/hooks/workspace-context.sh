#!/usr/bin/env bash
set -euo pipefail

# Point sessions inside a Forest workspace at its CONTEXT.md. The file can be
# large, so print only its path rather than its contents.
dir=$PWD
while [[ $dir != / ]]; do
  if [[ $(basename "$(dirname "$dir")") == .workspaces && -f $dir/CONTEXT.md ]]; then
    echo "This session is in Forest workspace $(basename "$dir"). Read $dir/CONTEXT.md before substantial work."
    exit 0
  fi
  dir=$(dirname "$dir")
done

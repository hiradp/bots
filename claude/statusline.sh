#!/bin/bash
# Claude Code statusline, shared by both identities — the default ~/.claude and
# the `claude-ps` ~/.claude-ps — which it self-detects via $CLAUDE_CONFIG_DIR.
#
# Layout: folder · branch +added -deleted #pr ↑ahead ↓behind · model effort
#         · context% [of window] · 5h pct% · wk pct% · $cost [· enterprise]
#
# Bracketed parts appear only when they matter: the context window from 50%
# used, and the identity only for claude-ps.

set -euo pipefail
set -f # disable globbing

input=$(cat)

if [ -z "$input" ]; then
  printf "Claude"
  exit 0
fi

# ===== Colors =====
# ANSI has no orange, so it comes from the 256-color palette.
esc=$'\033'
off="${esc}[0m"
fg="${esc}[39m"
gray="${esc}[90m"
red="${esc}[31m"
green="${esc}[32m"
yellow="${esc}[33m"
orange="${esc}[38;5;208m"
blue="${esc}[34m"
magenta="${esc}[35m"
cyan="${esc}[36m"

line=""
add() { if [ -n "$1" ]; then line+="${line:+${gray} · ${off}}$1"; fi; }

# ===== Extract data =====
# One jq call, fields joined by the unit separator (\x1f): unlike tab, it isn't
# IFS whitespace, so empty fields don't collapse into their neighbours.
# Rate-limit fields are only present for Claude.ai subscribers after the first
# API response.
fields=$(printf '%s' "$input" | jq -r '
  def pct: if type == "number" then [[round, 100] | min, 0] | max | tostring else "" end;
  def window:
    if . >= 1000000 then "\(. / 1000000 | round)M"
    elif . >= 1000 then "\(. / 1000 | round)k"
    else tostring end;
  [
    (.cwd // ""),
    (.workspace.current_dir // ""),
    (.workspace.project_dir // ""),
    (.model.display_name // "Claude"),
    (.effort.level // ""),
    (.context_window.used_percentage // 0 | pct),
    (.context_window.context_window_size | if type == "number" and . > 0 then . else 200000 end | window),
    (.rate_limits.five_hour.used_percentage | pct),
    (.rate_limits.seven_day.used_percentage | pct),
    (.pr.number // ""),
    (.pr.review_state // ""),
    (.cost.total_cost_usd | if type == "number" and . >= 0 then . else "" end)
  ] | map(tostring) | join("\u001f")' 2>/dev/null) || fields=""
IFS=$'\x1f' read -r cwd workspace_current workspace_project model_name effort_level \
  context_pct context_window rl_five rl_week pr_number pr_state session_cost <<<"$fields" || true

# < 50 → green  ≥50 → yellow  ≥65 → orange  ≥95 → red
level_color() {
  if [ "$1" -ge 95 ] 2>/dev/null; then
    printf '%s' "$red"
  elif [ "$1" -ge 65 ] 2>/dev/null; then
    printf '%s' "$orange"
  elif [ "$1" -ge 50 ] 2>/dev/null; then
    printf '%s' "$yellow"
  else
    printf '%s' "$green"
  fi
}

# ===== Location and git =====
if [ -n "$cwd" ]; then
  # Worktree detection: when workspace.current_dir and workspace.project_dir are
  # both present and differ, show "project⎇worktree"; otherwise just the basename.
  if [ -n "$workspace_current" ] && [ -n "$workspace_project" ] && [ "$workspace_current" != "$workspace_project" ]; then
    add "${blue}${workspace_project##*/}${gray}⎇${blue}${workspace_current##*/}${off}"
  else
    add "${blue}${cwd##*/}${off}"
  fi

  git_branch=$(git -C "${cwd}" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null) || git_branch=""
  if [ -n "$git_branch" ]; then
    branch_group="${cyan}${git_branch}${off}"

    # Tracked changes against HEAD, staged or not.
    git_stat=$(git -C "${cwd}" --no-optional-locks diff --numstat HEAD -- 2>/dev/null | awk '{a+=$1; d+=$2} END {if (a+d>0) print a, d}') || git_stat=""
    if [ -n "$git_stat" ]; then
      read -r lines_added lines_deleted <<<"$git_stat"
      branch_group+=" ${green}+${lines_added}${off} ${red}-${lines_deleted}${off}"
    fi

    if [ -n "$pr_number" ]; then
      case "$pr_state" in
        approved) pr_color="$green" ;;
        changes_requested) pr_color="$red" ;;
        pending) pr_color="$yellow" ;;
        merged) pr_color="$magenta" ;;
        *) pr_color="$gray" ;;
      esac
      branch_group+=" ${pr_color}#${pr_number}${off}"
    fi

    # Ahead/behind relative to upstream (silently skipped if no upstream)
    ab=$(git -C "${cwd}" --no-optional-locks rev-list --left-right --count '@{u}...HEAD' 2>/dev/null) || ab=""
    if [ -n "$ab" ]; then
      read -r behind ahead <<<"$ab"
      [ "$ahead" -gt 0 ] 2>/dev/null && branch_group+=" ${gray}↑${ahead}${off}"
      [ "$behind" -gt 0 ] 2>/dev/null && branch_group+=" ${gray}↓${behind}${off}"
    fi
    add "$branch_group"
  fi
fi

# ===== Model =====
model="${fg}${model_name:-Claude}${off}"
if [ -n "$effort_level" ]; then
  case "$effort_level" in
    low|medium) effort_color="$gray" ;;
    high) effort_color="$yellow" ;;
    xhigh) effort_color="$orange" ;;
    max) effort_color="$red" ;;
    *) effort_color="$magenta" ;;
  esac
  model+=" ${effort_color}${effort_level}${off}"
fi
add "$model"

# ===== Context and quotas =====
context_pct="${context_pct:-0}"
context="$(level_color "$context_pct")${context_pct}%${off}"
[ "$context_pct" -ge 50 ] 2>/dev/null && context+="${gray} of ${context_window:-200k}${off}"
add "$context"

# Quotas stay gray until 50%, then follow the context colors.
quota() {
  local color="$gray"
  [ "$2" -ge 50 ] 2>/dev/null && color=$(level_color "$2")
  add "${gray}$1${off} ${color}$2%${off}"
}
[ -n "$rl_five" ] && quota 5h "$rl_five"
[ -n "$rl_week" ] && quota wk "$rl_week"

# ===== API-equivalent session cost =====
if [ -n "$session_cost" ]; then
  LC_NUMERIC=C printf -v cost_display '$%.3f' "$session_cost"
  add "${gray}${cost_display}${off}"
fi

# ===== Identity =====
# Two Claude identities share this one statusline: the default `claude` runs with
# CLAUDE_CONFIG_DIR unset, `claude-ps` exports CLAUDE_CONFIG_DIR=~/.claude-ps. The
# CLI passes its environment to this command, so the config dir tells them apart.
case "${CLAUDE_CONFIG_DIR:-}" in
  */.claude-ps) add "${magenta}enterprise${off}" ;;
esac

printf '%s' "$line"
exit 0

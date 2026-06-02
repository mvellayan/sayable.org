#!/usr/bin/env bash
# Delete ALL communication data so you can retest from a clean slate.
# Wipes: contacts (relationships + members + invites), threads, messages,
# moderator beats, relationship patterns, and every user's PRIVATE coach data
# (drafts, reviews, observations), plus the safety-event log.
# KEEPS: user accounts (SayableUsers), OTP codes, and config.
#
# Destructive and irreversible. Operates on the live stack's tables.
#
# Usage:
#   ./admin/delete_all_comm.sh            # prompts; type DELETE to confirm
#   ./admin/delete_all_comm.sh --yes      # skip the prompt (careful)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../aws/_lib.sh"

require_cmd aws jq

PREFIX="${TABLE_PREFIX:-Sayable}"

# Communication tables to PURGE. Users / OtpCodes / Config are intentionally kept.
TABLES=(
  RelationshipMembers
  Relationships
  RelationshipInvites
  Threads
  Messages
  MediatorSummaries
  Patterns
  Drafts
  Reviews
  Observations
  SafetyEvents
)

info "Account: ${CDK_DEFAULT_ACCOUNT:-?}   Region: $AWS_REGION   Stack: $STACK_NAME"
warn "This deletes ALL conversations, messages, contacts, invites, private coach"
warn "data, and safety events. USER ACCOUNTS ARE KEPT. This cannot be undone."
echo

if [ "${1:-}" != "--yes" ]; then
  confirm "Type DELETE to wipe all communications:" "DELETE"
fi

# Purge one table by scanning its keys and batch-deleting (25 at a time).
purge_table() {
  local short="$1"
  local table="${PREFIX}${short}"

  # Key attribute names (HASH [+ RANGE]).
  local keynames
  if ! keynames=$(aws dynamodb describe-table \
        --table-name "$table" --region "$AWS_REGION" \
        --query "Table.KeySchema[].AttributeName" --output text 2>/dev/null); then
    warn "skip $table (not found)"
    return 0
  fi

  # Build a key-only projection, aliasing names to dodge reserved words.
  local proj="" names="{" i=0 a
  for a in $keynames; do
    [ "$i" -gt 0 ] && { proj+=","; names+=","; }
    proj+="#k$i"; names+="\"#k$i\":\"$a\""
    i=$((i + 1))
  done
  names+="}"

  local total=0 start=""
  while :; do
    local args=(--table-name "$table" --region "$AWS_REGION"
                --projection-expression "$proj"
                --expression-attribute-names "$names"
                --max-items 1000)
    [ -n "$start" ] && args+=(--starting-token "$start")

    local resp; resp=$(aws dynamodb scan "${args[@]}" --output json)
    local n; n=$(echo "$resp" | jq '.Items | length')

    if [ "$n" -gt 0 ]; then
      echo "$resp" | jq -c --arg t "$table" '
        def chunks(n): range(0; length; n) as $i | .[$i:$i+n];
        .Items | chunks(25) | { ($t): map({DeleteRequest:{Key:.}}) }
      ' | while IFS= read -r batch; do
        aws dynamodb batch-write-item \
          --request-items "$batch" --region "$AWS_REGION" >/dev/null
      done
      total=$((total + n))
    fi

    start=$(echo "$resp" | jq -r '.NextToken // empty')
    [ -z "$start" ] && break
  done

  ok "$table: deleted $total item(s)"
}

for t in "${TABLES[@]}"; do
  purge_table "$t"
done

ok "All communications cleared. User accounts left in place."

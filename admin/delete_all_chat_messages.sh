#!/usr/bin/env bash
# Delete every chat message in the deployed BetterVibe room. Destructive, no undo.
#
# Usage:
#   ./admin/delete_all_chat_messages.sh                  # interactive, messages only
#   ./admin/delete_all_chat_messages.sh --reset-mood     # also wipe sessions + mood state (full clean room)
#   ./admin/delete_all_chat_messages.sh --dry-run        # show what would happen, change nothing
#   ./admin/delete_all_chat_messages.sh -y               # skip confirmation (CI / scripted use)
#
# What it does:
#   1. Counts the rows in BetterVibeMessages.
#   2. (If --reset-mood) counts BetterVibeSessions and BetterVibeMoodState too.
#   3. Asks you to confirm by typing the message count.
#   4. Scans each table and deletes in batches of 25 (DynamoDB BatchWriteItem cap).
#
# What it does NOT touch:
#   - BetterVibeMembers (friends), BetterVibeOtpCodes, BetterVibeCharacters, BetterVibeConfig.
#   - S3 (frontend bucket, avatars bucket).
#   - Anything outside DynamoDB.
#
# Safe to re-run: subsequent runs find zero rows and exit clean.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/aws/_lib.sh"

require_cmd aws jq

RESET_MOOD=0
DRY_RUN=0
SKIP_CONFIRM=0
for arg in "$@"; do
  case "$arg" in
    --reset-mood) RESET_MOOD=1 ;;
    --dry-run)    DRY_RUN=1 ;;
    -y|--yes)     SKIP_CONFIRM=1 ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      err "Unknown argument: $arg"
      err "See: $0 --help"
      exit 1
      ;;
  esac
done

PREFIX="${TABLE_PREFIX:-BetterVibe}"
MESSAGES_TABLE="${PREFIX}Messages"
SESSIONS_TABLE="${PREFIX}Sessions"
MOOD_TABLE="${PREFIX}MoodState"

count_rows() {
  local table="$1"
  aws dynamodb scan \
    --region "$AWS_REGION" \
    --table-name "$table" \
    --select COUNT \
    --query "Count" \
    --output text 2>/dev/null || echo "0"
}

# Stream the items of a table as JSON one per line, with only the key
# attributes (so we can construct DeleteRequest payloads).
# $1 = table, $2 = comma-separated key attribute names (e.g. "roomId,ts").
stream_keys() {
  local table="$1"
  local keys="$2"
  local proj_expr
  local attr_names
  # Quote any reserved DynamoDB names ("ts" is reserved). Wrap every attribute
  # in a placeholder #k0, #k1, ... to be safe.
  IFS=',' read -ra parts <<< "$keys"
  proj_expr=""
  attr_names="{"
  for i in "${!parts[@]}"; do
    [ -n "$proj_expr" ] && proj_expr+=","
    proj_expr+="#k${i}"
    [ "$i" -gt 0 ] && attr_names+=","
    attr_names+="\"#k${i}\":\"${parts[$i]}\""
  done
  attr_names+="}"

  local start_key=""
  while true; do
    local cmd=(aws dynamodb scan
      --region "$AWS_REGION"
      --table-name "$table"
      --projection-expression "$proj_expr"
      --expression-attribute-names "$attr_names"
      --output json)
    [ -n "$start_key" ] && cmd+=(--starting-token "$start_key")
    local page
    page=$("${cmd[@]}")
    echo "$page" | jq -c '.Items[]'
    start_key=$(echo "$page" | jq -r '.NextToken // ""')
    [ -z "$start_key" ] && break
  done
}

# Delete all items from a table given its key attribute list.
# $1 = table, $2 = comma-separated key attribute names.
delete_all_from_table() {
  local table="$1"
  local keys="$2"
  local total=0
  local batch_file
  # BSD mktemp on macOS requires the X's at the END of the template, so a
  # `.json` suffix after them makes mktemp fail and return empty — which
  # then makes `--request-items "file://"` (no path) confuse AWS CLI into
  # shorthand-parsing mode and crash with "Expected: '=', received: 'EOF'".
  # Use the default (no template) for cross-platform safety.
  batch_file=$(mktemp)
  if [ -z "$batch_file" ] || [ ! -f "$batch_file" ]; then
    err "mktemp failed — could not create a working file."
    return 1
  fi
  trap 'rm -f "$batch_file"' RETURN

  local batch="[]"
  local count_in_batch=0

  flush_batch() {
    if [ "$count_in_batch" -eq 0 ]; then return; fi
    if [ "$DRY_RUN" = "1" ]; then
      total=$((total + count_in_batch))
      batch="[]"
      count_in_batch=0
      return
    fi
    # The CLI's --request-items file://... expects the file to contain JUST
    # the {TableName: [requests]} map — NOT wrapped in another
    # {RequestItems: ...} layer the way the SDK request body is shaped.
    jq -n --argjson reqs "$batch" --arg t "$table" \
      '{($t): $reqs}' > "$batch_file"
    # BatchWriteItem may partially succeed and return UnprocessedItems.
    # Retry with backoff until empty or we give up.
    local attempts=0
    local resp=""
    while true; do
      # Explicit fail-fast: macOS ships bash 3.2, where set -e on
      # `local resp=$(aws ...)` does NOT propagate the subshell exit
      # status. So check the exit code by hand, and capture stderr too.
      local stderr_file
      stderr_file=$(mktemp)
      if ! resp=$(aws dynamodb batch-write-item \
            --region "$AWS_REGION" \
            --request-items "file://$batch_file" \
            --output json 2>"$stderr_file"); then
        err "batch-write-item failed:"
        cat "$stderr_file" 1>&2
        rm -f "$stderr_file"
        return 1
      fi
      rm -f "$stderr_file"
      local unprocessed_count
      unprocessed_count=$(echo "$resp" | jq -r --arg t "$table" '.UnprocessedItems[$t] // [] | length')
      if [ "$unprocessed_count" = "0" ]; then break; fi
      attempts=$((attempts + 1))
      if [ "$attempts" -gt 5 ]; then
        warn "After 5 retries, $unprocessed_count items in $table were still unprocessed. Re-run the script."
        break
      fi
      sleep $((attempts * 2))
      # Re-shape unprocessed items back into the same {TableName: [requests]}
      # file format for the retry. Same as above — no RequestItems wrapper.
      echo "$resp" | jq --arg t "$table" '{($t): .UnprocessedItems[$t]}' > "$batch_file"
    done
    total=$((total + count_in_batch))
    batch="[]"
    count_in_batch=0
  }

  while IFS= read -r key_json; do
    [ -z "$key_json" ] && continue
    batch=$(echo "$batch" | jq --argjson k "$key_json" '. + [{DeleteRequest:{Key:$k}}]')
    count_in_batch=$((count_in_batch + 1))
    if [ "$count_in_batch" -ge 25 ]; then flush_batch; fi
  done < <(stream_keys "$table" "$keys")

  flush_batch
  echo "$total"
}

# --- Plan -------------------------------------------------------------------

info "Region:           $AWS_REGION"
info "Table prefix:     $PREFIX"
info ""
info "Counting rows..."
MESSAGES_COUNT=$(count_rows "$MESSAGES_TABLE")
info "  $MESSAGES_TABLE: $MESSAGES_COUNT rows"

if [ "$RESET_MOOD" = "1" ]; then
  SESSIONS_COUNT=$(count_rows "$SESSIONS_TABLE")
  MOOD_COUNT=$(count_rows "$MOOD_TABLE")
  info "  $SESSIONS_TABLE: $SESSIONS_COUNT rows"
  info "  $MOOD_TABLE: $MOOD_COUNT rows"
  TOTAL=$((MESSAGES_COUNT + SESSIONS_COUNT + MOOD_COUNT))
else
  TOTAL=$MESSAGES_COUNT
fi

if [ "$TOTAL" = "0" ]; then
  ok "Nothing to delete. The room is already quiet."
  exit 0
fi

info ""
if [ "$DRY_RUN" = "1" ]; then
  warn "DRY RUN: $TOTAL row(s) would be deleted. No changes will be made."
else
  warn "About to permanently delete $TOTAL row(s). This cannot be undone."
fi

# --- Confirm ----------------------------------------------------------------

if [ "$SKIP_CONFIRM" = "0" ] && [ "$DRY_RUN" = "0" ]; then
  echo
  read -r -p "To confirm, type the message count ($MESSAGES_COUNT) and press enter: " ans
  if [ "$ans" != "$MESSAGES_COUNT" ]; then
    err "Aborted. Typed '$ans' but expected '$MESSAGES_COUNT'."
    exit 1
  fi
fi

# --- Execute ----------------------------------------------------------------

info ""
info "Deleting from $MESSAGES_TABLE ..."
deleted=$(delete_all_from_table "$MESSAGES_TABLE" "roomId,ts")
ok "  $MESSAGES_TABLE: $deleted deleted"

if [ "$RESET_MOOD" = "1" ]; then
  info "Deleting from $SESSIONS_TABLE ..."
  deleted=$(delete_all_from_table "$SESSIONS_TABLE" "sessionId")
  ok "  $SESSIONS_TABLE: $deleted deleted"

  info "Deleting from $MOOD_TABLE ..."
  deleted=$(delete_all_from_table "$MOOD_TABLE" "sessionId,characterId")
  ok "  $MOOD_TABLE: $deleted deleted"
fi

if [ "$DRY_RUN" = "1" ]; then
  info ""
  ok "Dry run complete. No data was changed."
else
  info ""
  ok "Done. The room is quiet again."
  if [ "$RESET_MOOD" = "0" ] && [ "$MESSAGES_COUNT" -gt 0 ]; then
    info "Note: character mood vectors are unchanged. Pass --reset-mood to wipe them too."
  fi
fi

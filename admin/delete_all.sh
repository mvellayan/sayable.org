#!/usr/bin/env bash
# FULL reset. Runs delete_all_comm.sh (wipe all communications), then deletes
# EVERY user except the owner/admin (OWNER_EMAIL) — and their OTP codes.
# Leaves only your account. Destructive and irreversible.
#
# Usage:
#   ./admin/delete_all.sh          # prompts; type DELETE to confirm
#   ./admin/delete_all.sh --yes    # skip the prompt (careful)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../aws/_lib.sh"

require_cmd aws jq

PREFIX="${TABLE_PREFIX:-Sayable}"
OWNER_LC="$(printf '%s' "${OWNER_EMAIL:-}" | tr '[:upper:]' '[:lower:]')"
[ -z "$OWNER_LC" ] && { err "OWNER_EMAIL not set (aws/.env). Refusing to delete all users."; exit 1; }

USERS="${PREFIX}Users"
OTP="${PREFIX}OtpCodes"

info "Account: ${CDK_DEFAULT_ACCOUNT:-?}   Region: $AWS_REGION"
info "Owner KEPT: $OWNER_LC"
warn "This wipes ALL communications AND deletes EVERY user except the owner."
warn "Irreversible."
echo

if [ "${1:-}" != "--yes" ]; then
  confirm "Type DELETE to wipe everything except your account:" "DELETE"
fi

# Guard: make sure the owner actually exists, or we'd delete everyone.
OWNER_COUNT=$(aws dynamodb scan \
  --table-name "$USERS" --region "$AWS_REGION" \
  --filter-expression "emailLower = :o" \
  --expression-attribute-values "{\":o\":{\"S\":\"$OWNER_LC\"}}" \
  --select COUNT --query "Count" --output text 2>/dev/null || echo 0)
if [ "${OWNER_COUNT:-0}" -lt 1 ]; then
  err "No user matches OWNER_EMAIL ($OWNER_LC). Refusing to delete all users."
  exit 1
fi

# 1) Communications.
info "Clearing all communications..."
"$SCRIPT_DIR/delete_all_comm.sh" --yes

# 2) Users (and their OTP codes), except the owner.
info "Deleting users except the owner..."
deleted=0
start=""
while :; do
  args=(--table-name "$USERS" --region "$AWS_REGION"
        --projection-expression "userId, emailLower, email"
        --max-items 1000)
  [ -n "$start" ] && args+=(--starting-token "$start")
  resp=$(aws dynamodb scan "${args[@]}" --output json)

  rows=$(echo "$resp" | jq -c --arg owner "$OWNER_LC" '
    .Items[]
    | { uid: .userId.S,
        eml: ((.emailLower.S) // ((.email.S // "") | ascii_downcase)) }
    | select(.eml != $owner)
  ')

  if [ -n "$rows" ]; then
    while IFS= read -r row; do
      [ -z "$row" ] && continue
      uid=$(printf '%s' "$row" | jq -r '.uid')
      eml=$(printf '%s' "$row" | jq -r '.eml')
      aws dynamodb delete-item --table-name "$USERS" --region "$AWS_REGION" \
        --key "{\"userId\":{\"S\":\"$uid\"}}" >/dev/null
      if [ -n "$eml" ]; then
        aws dynamodb delete-item --table-name "$OTP" --region "$AWS_REGION" \
          --key "{\"emailLower\":{\"S\":\"$eml\"}}" >/dev/null 2>&1 || true
      fi
      deleted=$((deleted + 1))
    done <<< "$rows"
  fi

  start=$(echo "$resp" | jq -r '.NextToken // empty')
  [ -z "$start" ] && break
done

ok "Deleted $deleted user(s). Kept the owner: $OWNER_LC."
ok "Full reset complete."

#!/usr/bin/env bash
# Pre-approve a friend so they can sign in without the admin-approval round-trip.
# Adds them as an active member directly in DynamoDB.
#
# Usage:
#   ./admin/invite-friend.sh <email> <firstName> [lastName]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/aws/_lib.sh"

EMAIL="${1:-}"
FIRST="${2:-}"
LAST="${3:-}"

if [ -z "$EMAIL" ] || [ -z "$FIRST" ]; then
  err "usage: $0 <email> <firstName> [lastName]"
  exit 1
fi

require_cmd aws jq

MEMBERS_TABLE="${TABLE_PREFIX:-BetterVibe}Members"
EMAIL_LOWER=$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]')

# Check if a member already exists.
EXISTING=$(aws dynamodb query \
  --region "$AWS_REGION" \
  --table-name "$MEMBERS_TABLE" \
  --index-name byEmail \
  --key-condition-expression "emailLower = :e" \
  --expression-attribute-values "{\":e\":{\"S\":\"$EMAIL_LOWER\"}}" \
  --limit 1 \
  --output json 2>/dev/null || echo '{"Items":[]}')

EXISTING_COUNT=$(echo "$EXISTING" | jq -r '.Items | length')

if [ "$EXISTING_COUNT" -gt 0 ]; then
  MID=$(echo "$EXISTING" | jq -r '.Items[0].memberId.S')
  info "Friend already exists ($MID). Marking active."
  aws dynamodb update-item \
    --region "$AWS_REGION" \
    --table-name "$MEMBERS_TABLE" \
    --key "{\"memberId\":{\"S\":\"$MID\"}}" \
    --update-expression "SET #s = :a, updatedAt = :t" \
    --expression-attribute-names '{"#s":"status"}' \
    --expression-attribute-values "{\":a\":{\"S\":\"active\"},\":t\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}" >/dev/null
  ok "Friend $EMAIL is active."
  exit 0
fi

# Generate a small URL-safe id. base64url 9 bytes = 12 chars.
MID="mbr_$(head -c 9 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=')"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

aws dynamodb put-item \
  --region "$AWS_REGION" \
  --table-name "$MEMBERS_TABLE" \
  --item "{
    \"memberId\": {\"S\": \"$MID\"},
    \"email\": {\"S\": \"$EMAIL\"},
    \"emailLower\": {\"S\": \"$EMAIL_LOWER\"},
    \"firstName\": {\"S\": \"$FIRST\"},
    \"lastName\": {\"S\": \"$LAST\"},
    \"role\": {\"S\": \"user\"},
    \"status\": {\"S\": \"active\"},
    \"createdAt\": {\"S\": \"$NOW\"},
    \"updatedAt\": {\"S\": \"$NOW\"}
  }" >/dev/null

ok "Invited $FIRST $LAST <$EMAIL> as memberId=$MID. They can sign in at https://${APP_DOMAIN:-bettervibe.bettervibe.live}."

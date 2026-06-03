#!/usr/bin/env bash
# Send a file to someone as an email, from sayable.org (Amazon SES).
#
# Usage:
#   ./admin/send_email.sh <to-email> <subject> <file>
#
# Examples:
#   ./admin/send_email.sh sam@example.com "How Sayable works" frontend/src/instructions.md
#   ./admin/send_email.sh sam@example.com "Welcome to Sayable" note.html
#
# Behaviour:
#   - .html / .htm files are sent as an HTML body; anything else as plain text.
#   - The sender is NOTIFICATION_SENDER_EMAIL (falls back to OTP_SENDER_EMAIL),
#     read from aws/.env. The "From" name is APP_BRAND.
#
# Note: if the SES account is still in the sandbox, the recipient must be a
# verified identity. This account has production access, so any recipient works.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../aws/_lib.sh"

require_cmd aws jq

TO="${1:-}"
SUBJECT="${2:-}"
FILE="${3:-}"

if [ -z "$TO" ] || [ -z "$SUBJECT" ] || [ -z "$FILE" ]; then
  err "Usage: ./admin/send_email.sh <to-email> <subject> <file>"
  exit 1
fi
case "$TO" in
  *@*.*) : ;;
  *) err "That doesn't look like an email address: $TO"; exit 1 ;;
esac
if [ ! -f "$FILE" ]; then
  err "File not found: $FILE"
  exit 1
fi

BRAND="${APP_BRAND:-Sayable}"
SENDER="${NOTIFICATION_SENDER_EMAIL:-${OTP_SENDER_EMAIL:-}}"
if [ -z "$SENDER" ]; then
  err "No sender configured. Set NOTIFICATION_SENDER_EMAIL or OTP_SENDER_EMAIL in aws/.env."
  exit 1
fi
FROM="$BRAND <$SENDER>"

# Text body unless the file is HTML.
case "$FILE" in
  *.html|*.htm) FIELD="Html" ;;
  *)            FIELD="Text" ;;
esac

# Build the request safely (jq escapes the file contents and the subject).
CONTENT="$(jq -n \
  --rawfile body "$FILE" \
  --arg subj "$SUBJECT" \
  --arg field "$FIELD" \
  '{Simple:{Subject:{Data:$subj,Charset:"UTF-8"},Body:{($field):{Data:$body,Charset:"UTF-8"}}}}')"

BYTES=$(wc -c < "$FILE" | tr -d ' ')
info "From:    $FROM"
info "To:      $TO"
info "Subject: $SUBJECT"
info "Body:    $FILE  ($FIELD, ${BYTES} bytes)"

MSG_ID="$(aws sesv2 send-email \
  --region "$AWS_REGION" \
  --from-email-address "$FROM" \
  --destination "ToAddresses=$TO" \
  --content "$CONTENT" \
  --query 'MessageId' --output text)"

ok "Sent. MessageId: $MSG_ID"

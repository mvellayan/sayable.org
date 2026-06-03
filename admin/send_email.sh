#!/usr/bin/env bash
# Send a file to someone as an email, from sayable.org (Amazon SES).
#
# Usage:
#   ./admin/send_email.sh <to-email> <file> [subject]
#
# Examples:
#   ./admin/send_email.sh sam@example.com frontend/src/instructions.md
#   ./admin/send_email.sh sam@example.com note.html "Welcome to Sayable"
#
# Behaviour:
#   - .html / .htm files are sent as an HTML body; anything else as plain text.
#   - The sender is NOTIFICATION_SENDER_EMAIL (falls back to OTP_SENDER_EMAIL),
#     read from aws/.env. The "From" name is APP_BRAND.
#   - Subject defaults to the file's first "# " markdown heading, else its first
#     non-empty line, else "A message from <brand>". Pass a 3rd arg to override.
#
# Note: if the SES account is still in the sandbox, the recipient must be a
# verified identity. This account has production access, so any recipient works.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../aws/_lib.sh"

require_cmd aws jq

TO="${1:-}"
FILE="${2:-}"
SUBJECT_ARG="${3:-}"

if [ -z "$TO" ] || [ -z "$FILE" ]; then
  err "Usage: ./admin/send_email.sh <to-email> <file> [subject]"
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

# Subject: explicit arg → first markdown H1 → first non-empty line → fallback.
if [ -n "$SUBJECT_ARG" ]; then
  SUBJECT="$SUBJECT_ARG"
else
  SUBJECT="$(grep -m1 '^# ' "$FILE" 2>/dev/null | sed 's/^# //' || true)"
  [ -z "$SUBJECT" ] && SUBJECT="$(grep -m1 . "$FILE" 2>/dev/null | cut -c1-150 || true)"
  [ -z "$SUBJECT" ] && SUBJECT="A message from $BRAND"
fi

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

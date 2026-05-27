#!/usr/bin/env bash
# Tail CloudWatch logs for a Sayable Lambda function.
# Usage: show_log.sh [auth|api|daily-mailer] [--since 10m]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

require_cmd aws

NAME="${1:-api}"
SINCE_VAL="${2:-15m}"

case "$NAME" in
  auth)            FN="sayable-auth" ;;
  api)             FN="sayable-api" ;;
  daily|daily-mailer|dailymailer|mailer) FN="sayable-dailymailer" ;;
  *)               FN="$NAME" ;;
esac

LG="/aws/lambda/$FN"
info "Tailing $LG  (since $SINCE_VAL)...  (Ctrl-C to stop)"

aws logs tail "$LG" \
  --region "$AWS_REGION" \
  --follow \
  --since "$SINCE_VAL" \
  --format short

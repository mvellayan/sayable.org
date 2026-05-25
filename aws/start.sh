#!/usr/bin/env bash
# Enable the daily mailer EventBridge rule.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

require_cmd aws

RULE_NAME="$(stack_output DailyMailerRuleName)"
if [ -z "$RULE_NAME" ]; then
  err "Could not read DailyMailerRuleName from stack outputs."
  exit 1
fi

aws events enable-rule --name "$RULE_NAME" --region "$AWS_REGION"
ok "Enabled $RULE_NAME"

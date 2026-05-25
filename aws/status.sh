#!/usr/bin/env bash
# Show the current state of the deployed BetterVibe stack.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

require_cmd aws

STACK_STATUS="$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].StackStatus" \
  --output text 2>/dev/null || echo "NOT_DEPLOYED")"

echo "Stack:        $STACK_NAME"
echo "Region:       $AWS_REGION"
echo "Status:       $STACK_STATUS"

if [ "$STACK_STATUS" = "NOT_DEPLOYED" ]; then
  warn "Stack not deployed. Run ./aws/create.sh"
  exit 0
fi

echo
echo "Outputs:"
aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" \
  --output table

echo
echo "DynamoDB tables:"
aws dynamodb list-tables --region "$AWS_REGION" --output json | \
  python3 -c "import sys,json; ts=json.load(sys.stdin)['TableNames']; [print('  '+t) for t in ts if t.startswith('BetterVibe')]"

echo
echo "Lambda functions:"
for fn in bettervibe-auth bettervibe-api bettervibe-dailymailer; do
  state="$(aws lambda get-function --region "$AWS_REGION" --function-name "$fn" \
    --query "Configuration.[State,LastUpdateStatus]" --output text 2>/dev/null || echo "missing")"
  echo "  $fn  $state"
done

echo
echo "EventBridge rule (daily mailer):"
RULE_NAME="$(stack_output DailyMailerRuleName || true)"
if [ -n "$RULE_NAME" ]; then
  aws events describe-rule --name "$RULE_NAME" --region "$AWS_REGION" \
    --query "[Name,State,ScheduleExpression]" --output table 2>/dev/null \
    || warn "Rule $RULE_NAME not found"
fi

echo
echo "SES sender verification:"
aws ses get-identity-verification-attributes \
  --region "$AWS_REGION" \
  --identities "$OTP_SENDER_EMAIL" \
  --output table 2>/dev/null || warn "SES not configured in $AWS_REGION"

echo
APP_URL="$(stack_output AppUrl)"
echo "App URL:      $APP_URL"

#!/usr/bin/env bash
# Delete all AWS resources created by the BetterVibe stack.
# This script is destructive. It will:
#   • empty and delete the frontend bucket
#   • drop all DynamoDB tables (BetterVibe*)
#   • remove Lambda functions, API Gateway, CloudFront distribution
#   • remove the Route 53 alias records created by this stack
#   • delete the JWT and Anthropic-API-key secrets
# It will NOT delete the Route 53 hosted zone or unrelated certificates.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

require_cmd aws node npm

warn "You are about to DESTROY all resources in stack $STACK_NAME ($AWS_REGION)."
warn "This includes DynamoDB tables (your tasks, accomplishments, profile). There is no undo."
confirm "Type DESTROY to continue:" "DESTROY"

FRONTEND_BUCKET="$(stack_output FrontendBucketName || true)"

if [ -n "${FRONTEND_BUCKET:-}" ]; then
  info "Emptying frontend bucket: $FRONTEND_BUCKET"
  aws s3 rm "s3://$FRONTEND_BUCKET" --recursive --region "$AWS_REGION" || true
fi

info "Running cdk destroy..."
( cd "$ROOT_DIR/infra" && npx cdk destroy --force "$STACK_NAME" )

ok "Destroy complete."

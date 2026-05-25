#!/usr/bin/env bash
# Provision all AWS resources for BetterVibe.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

require_cmd aws node npm

info "Account:   $CDK_DEFAULT_ACCOUNT"
info "Region:    $AWS_REGION"
info "Domain:    $APP_DOMAIN  (zone $ROOT_DOMAIN)"
info "Sender:    $OTP_SENDER_EMAIL"
info "Owner:     $OWNER_EMAIL"

# Confirm Route 53 hosted zone for the apex exists; CDK will fail if not.
if ! aws route53 list-hosted-zones-by-name \
      --dns-name "$ROOT_DOMAIN." \
      --max-items 1 \
      --query "HostedZones[0].Name" \
      --output text 2>/dev/null | grep -q "^$ROOT_DOMAIN"; then
  warn "Route 53 hosted zone for $ROOT_DOMAIN was not found in this account."
  warn "Create the zone (or transfer the domain to Route 53) before continuing."
  warn "If you registered bettervibe.bettervibe.live through Route 53, the zone should already exist."
  confirm "Continue anyway? (y/N)" "y"
fi

# SES sender check (sender must be verified; production access already granted).
if ! aws ses get-identity-verification-attributes \
      --region "$AWS_REGION" \
      --identities "$OTP_SENDER_EMAIL" \
      --query "VerificationAttributes.\"$OTP_SENDER_EMAIL\".VerificationStatus" \
      --output text 2>/dev/null | grep -q Success; then
  warn "SES sender $OTP_SENDER_EMAIL is not verified in $AWS_REGION."
  warn "Run: aws ses verify-email-identity --email-address $OTP_SENDER_EMAIL --region $AWS_REGION"
  warn "Then click the verification link before signing in to BetterVibe."
fi

info "Installing backend dependencies (for Lambda asset)..."
( cd "$ROOT_DIR/backend" && npm install --omit=dev --silent )

info "Installing infra dependencies..."
( cd "$ROOT_DIR/infra" && npm install --silent )

info "Bootstrapping CDK (idempotent)..."
( cd "$ROOT_DIR/infra" && npx cdk bootstrap "aws://$CDK_DEFAULT_ACCOUNT/$AWS_REGION" )

info "Deploying $STACK_NAME ..."
(
  cd "$ROOT_DIR/infra"
  ROOT_DOMAIN="$ROOT_DOMAIN" \
  APP_DOMAIN="$APP_DOMAIN" \
  OTP_SENDER_EMAIL="$OTP_SENDER_EMAIL" \
  NOTIFICATION_SENDER_EMAIL="$NOTIFICATION_SENDER_EMAIL" \
  APP_BRAND="$APP_BRAND" \
  OWNER_EMAIL="$OWNER_EMAIL" \
  npx cdk deploy --require-approval never --no-rollback
)

ok "Stack deployed."

# After first deploy, prompt for the Anthropic API key and store it in Secrets Manager.
ANTHROPIC_SECRET_ARN="$(stack_output AnthropicSecretArn || true)"
if [ -n "$ANTHROPIC_SECRET_ARN" ]; then
  CURRENT_VAL="$(aws secretsmanager get-secret-value \
    --secret-id "$ANTHROPIC_SECRET_ARN" \
    --region "$AWS_REGION" \
    --query SecretString --output text 2>/dev/null || true)"
  if [ "$CURRENT_VAL" = "REPLACE_ME_VIA_CREATE_SH" ] || [ -z "$CURRENT_VAL" ]; then
    echo
    info "Anthropic API key required. Paste it now (input hidden):"
    read -rs -p "ANTHROPIC_API_KEY: " ANTHROPIC_KEY
    echo
    if [ -n "${ANTHROPIC_KEY:-}" ]; then
      aws secretsmanager put-secret-value \
        --region "$AWS_REGION" \
        --secret-id "$ANTHROPIC_SECRET_ARN" \
        --secret-string "$ANTHROPIC_KEY" >/dev/null
      ok "Anthropic API key stored in Secrets Manager."
    else
      warn "No key provided. Set it later with: aws secretsmanager put-secret-value --secret-id $ANTHROPIC_SECRET_ARN --secret-string YOUR_KEY"
    fi
  else
    info "Anthropic API key already set."
  fi
fi

"$SCRIPT_DIR/redeploy.sh" --frontend-only
"$SCRIPT_DIR/status.sh"

APP_URL="$(stack_output AppUrl || true)"
info "Next:"
info "  1. Visit $APP_URL  (DNS may take a few minutes to propagate)"
info "  2. Sign in with $OWNER_EMAIL (auto-created as admin)"

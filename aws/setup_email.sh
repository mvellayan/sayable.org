#!/usr/bin/env bash
# Enable sending email from @sayable.org via Amazon SES.
# Creates an SES domain identity (Easy DKIM) + custom MAIL FROM, and writes the
# required DNS into the Route 53 hosted zone. Idempotent. See aws/email.md.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

require_cmd aws jq

DOMAIN="${ROOT_DOMAIN:-sayable.org}"
MAIL_FROM="mail.$DOMAIN"
REGION="$AWS_REGION"

info "Domain:    $DOMAIN"
info "MAIL FROM: $MAIL_FROM"
info "Region:    $REGION"

ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN." \
  --query "HostedZones[?Name=='${DOMAIN}.'].Id | [0]" --output text 2>/dev/null \
  | sed 's#/hostedzone/##')
if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" = "None" ]; then
  err "No Route 53 hosted zone found for $DOMAIN."
  exit 1
fi
info "Hosted zone: $ZONE_ID"

# 1) SES domain identity with Easy DKIM (idempotent).
if aws sesv2 get-email-identity --region "$REGION" --email-identity "$DOMAIN" >/dev/null 2>&1; then
  info "SES identity $DOMAIN already exists."
else
  info "Creating SES domain identity (Easy DKIM)..."
  aws sesv2 create-email-identity --region "$REGION" --email-identity "$DOMAIN" >/dev/null
fi

# 2) Custom MAIL FROM subdomain.
info "Setting MAIL FROM to $MAIL_FROM ..."
aws sesv2 put-email-identity-mail-from-attributes --region "$REGION" \
  --email-identity "$DOMAIN" \
  --mail-from-domain "$MAIL_FROM" \
  --behavior-on-mx-failure USE_DEFAULT_VALUE >/dev/null

# 3) DKIM tokens → CNAME targets.
TOKENS=$(aws sesv2 get-email-identity --region "$REGION" --email-identity "$DOMAIN" \
  --query "DkimAttributes.Tokens" --output text)
if [ -z "$TOKENS" ] || [ "$TOKENS" = "None" ]; then
  err "No DKIM tokens returned for $DOMAIN."
  exit 1
fi

# 4) Build + apply the Route 53 records (UPSERT — safe to re-run).
BATCH=$(jq -n \
  --arg domain "$DOMAIN" --arg mailfrom "$MAIL_FROM" --arg region "$REGION" \
  --arg tokens "$TOKENS" '
  ($tokens | split("\t") | map(select(length > 0))) as $tk
  | {
      Comment: "Sayable SES email sending",
      Changes: (
        ($tk | map({
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: (. + "._domainkey." + $domain),
            Type: "CNAME", TTL: 1800,
            ResourceRecords: [ { Value: (. + ".dkim.amazonses.com") } ]
          }
        }))
        + [
          { Action: "UPSERT", ResourceRecordSet: {
              Name: $mailfrom, Type: "MX", TTL: 1800,
              ResourceRecords: [ { Value: ("10 feedback-smtp." + $region + ".amazonses.com") } ] } },
          { Action: "UPSERT", ResourceRecordSet: {
              Name: $mailfrom, Type: "TXT", TTL: 1800,
              ResourceRecords: [ { Value: "\"v=spf1 include:amazonses.com ~all\"" } ] } },
          { Action: "UPSERT", ResourceRecordSet: {
              Name: ("_dmarc." + $domain), Type: "TXT", TTL: 1800,
              ResourceRecords: [ { Value: "\"v=DMARC1; p=none;\"" } ] } }
        ]
      )
    }')

TMP=$(mktemp)
printf '%s' "$BATCH" > "$TMP"
info "Writing DNS records (DKIM x3, MAIL FROM MX + SPF, DMARC)..."
aws route53 change-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" --change-batch "file://$TMP" >/dev/null
rm -f "$TMP"

ok "DNS records written. SES verifies DKIM within a few minutes."
echo
info "Next steps:"
info "  1. Wait for DKIM:  aws sesv2 get-email-identity --region $REGION \\"
info "        --email-identity $DOMAIN --query 'DkimAttributes.Status'   (want SUCCESS)"
info "  2. Point the app at the domain in aws/.env, then redeploy:"
info "        OTP_SENDER_EMAIL=noreply@$DOMAIN"
info "        NOTIFICATION_SENDER_EMAIL=noreply@$DOMAIN"
info "        ./aws/redeploy.sh --backend-only"
info "  3. If still in the SES sandbox, request production access in the SES console."

#!/usr/bin/env bash
# Tear down SES email sending for @sayable.org: remove the DNS records (DKIM,
# MAIL FROM MX/SPF, DMARC) and delete the SES domain identity. Best-effort and
# scoped — never touches anything else in the zone or the nayalle.com sender.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

require_cmd aws jq

DOMAIN="${ROOT_DOMAIN:-sayable.org}"
MAIL_FROM="mail.$DOMAIN"
REGION="$AWS_REGION"

info "Domain: $DOMAIN   Region: $REGION"
warn "This removes SES email sending for $DOMAIN (DNS records + SES identity)."
echo
if [ "${1:-}" != "--yes" ]; then
  confirm "Type yes to tear down email for $DOMAIN:" "yes"
fi

ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN." \
  --query "HostedZones[?Name=='${DOMAIN}.'].Id | [0]" --output text 2>/dev/null \
  | sed 's#/hostedzone/##')
if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" = "None" ]; then
  warn "No Route 53 hosted zone for $DOMAIN — skipping DNS cleanup."
  ZONE_ID=""
fi

# Delete one record by reading its exact live value (so DELETE always matches).
delete_record() {
  [ -z "$ZONE_ID" ] && return 0
  local name="$1" type="$2" rr batch
  rr=$(aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --query "ResourceRecordSets[?Name=='${name}.' && Type=='${type}'] | [0]" \
    --output json 2>/dev/null || echo null)
  if [ -z "$rr" ] || [ "$rr" = "null" ]; then
    info "no $type record for $name"
    return 0
  fi
  batch=$(jq -n --argjson rr "$rr" '{Changes:[{Action:"DELETE",ResourceRecordSet:$rr}]}')
  if aws route53 change-resource-record-sets \
      --hosted-zone-id "$ZONE_ID" --change-batch "$batch" >/dev/null 2>&1; then
    ok "removed $type $name"
  else
    warn "could not remove $type $name"
  fi
}

# DKIM CNAMEs — read the tokens from the identity BEFORE deleting it.
TOKENS=$(aws sesv2 get-email-identity --region "$REGION" --email-identity "$DOMAIN" \
  --query "DkimAttributes.Tokens" --output text 2>/dev/null || true)
for t in $TOKENS; do
  [ "$t" = "None" ] && continue
  delete_record "${t}._domainkey.${DOMAIN}" CNAME
done

delete_record "$MAIL_FROM" MX
delete_record "$MAIL_FROM" TXT
delete_record "_dmarc.${DOMAIN}" TXT

# Delete the SES identity.
if aws sesv2 get-email-identity --region "$REGION" --email-identity "$DOMAIN" >/dev/null 2>&1; then
  aws sesv2 delete-email-identity --region "$REGION" --email-identity "$DOMAIN" >/dev/null
  ok "deleted SES identity $DOMAIN"
else
  info "SES identity $DOMAIN not found"
fi

ok "Email sending for $DOMAIN torn down."

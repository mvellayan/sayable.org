#!/usr/bin/env bash
# Redeploy code without recreating infrastructure.
# Usage: redeploy.sh [--frontend-only|--backend-only]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

require_cmd aws node npm

MODE="all"
case "${1:-}" in
  --frontend-only) MODE="frontend" ;;
  --backend-only)  MODE="backend"  ;;
esac

API_URL="$(stack_output ApiUrl || true)"
FRONTEND_BUCKET="$(stack_output FrontendBucketName || true)"
DIST_ID="$(stack_output DistributionId || true)"

if [ -z "$FRONTEND_BUCKET" ] && [ "$MODE" != "backend" ]; then
  warn "Stack outputs not found yet. Run ./aws/create.sh first."
fi

if [ "$MODE" = "all" ] || [ "$MODE" = "backend" ]; then
  info "Installing backend dependencies..."
  ( cd "$ROOT_DIR/backend" && npm install --omit=dev --silent )

  info "Deploying CDK stack (Lambda code + infra)..."
  ( cd "$ROOT_DIR/infra" && npm install --silent )
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
fi

if [ "$MODE" = "all" ] || [ "$MODE" = "frontend" ]; then
  API_URL="$(stack_output ApiUrl)"
  FRONTEND_BUCKET="$(stack_output FrontendBucketName)"
  DIST_ID="$(stack_output DistributionId)"
  info "Building frontend (API base: $API_URL)..."
  (
    cd "$ROOT_DIR/frontend"
    npm install --silent
    VITE_API_BASE_URL="$API_URL" \
    VITE_COACH_STREAM_URL="$(stack_output CoachStreamUrl)" \
    VITE_APP_NAME="${APP_BRAND:-Sayable}" \
    npm run build
  )
  info "Syncing frontend to s3://$FRONTEND_BUCKET ..."
  # Hashed assets are immutable (1yr). The service worker + its registrar + the
  # entry HTML + manifest MUST stay revalidated, or the PWA pins users to an old
  # build forever. vite-plugin-pwa emits sw.js and registerSW.js (NOT
  # service-worker.js) — get these names right or deploys never reach users.
  aws s3 sync "$ROOT_DIR/frontend/dist/" "s3://$FRONTEND_BUCKET/" \
    --region "$AWS_REGION" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html" \
    --exclude "sw.js" \
    --exclude "registerSW.js" \
    --exclude "*.webmanifest"
  aws s3 sync "$ROOT_DIR/frontend/dist/" "s3://$FRONTEND_BUCKET/" \
    --region "$AWS_REGION" \
    --cache-control "public, max-age=0, must-revalidate" \
    --exclude "*" \
    --include "index.html" \
    --include "sw.js" \
    --include "registerSW.js" \
    --include "*.webmanifest"
  info "Invalidating CloudFront ($DIST_ID)..."
  aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/index.html" "/sw.js" "/registerSW.js" "/*.webmanifest" >/dev/null
fi

ok "Redeploy complete."

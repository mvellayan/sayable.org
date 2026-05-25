#!/usr/bin/env bash
# Shared helpers for aws/*.sh scripts. Source this from each script.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_DIR="$ROOT_DIR/aws"

if [ -f "$AWS_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$AWS_DIR/.env"
  set +a
elif [ -f "$AWS_DIR/env.example" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$AWS_DIR/env.example"
  set +a
fi

export AWS_REGION="${AWS_REGION:-us-east-1}"
export CDK_DEFAULT_REGION="$AWS_REGION"
if command -v aws >/dev/null 2>&1; then
  CDK_DEFAULT_ACCOUNT="${CDK_DEFAULT_ACCOUNT:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)}"
  export CDK_DEFAULT_ACCOUNT
fi

STACK_NAME="${STACK_NAME:-BetterVibeStack}"

color() {
  local c="$1"; shift
  printf "\033[%sm%s\033[0m\n" "$c" "$*"
}
info()  { color "36" "ℹ $*"; }
ok()    { color "32" "✓ $*"; }
warn()  { color "33" "⚠ $*"; }
err()   { color "31" "✗ $*" 1>&2; }

stack_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --region "$AWS_REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" \
    --output text 2>/dev/null
}

require_cmd() {
  for c in "$@"; do
    if ! command -v "$c" >/dev/null 2>&1; then
      err "Missing required command: $c"
      exit 1
    fi
  done
}

confirm() {
  local prompt="$1"
  local expected="${2:-y}"
  read -r -p "$prompt " ans
  if [ "$ans" != "$expected" ]; then
    err "Aborted."
    exit 1
  fi
}

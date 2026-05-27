#!/usr/bin/env bash
# Remove a friend (and their messages) from the deployed Sayable stack.
# Usage: ./aws/delete_user.sh <email>
#
# TODO (Day 8): wire this up. Sayable is single-tenant — one room, many friends.
# Deleting a "user" means:
#   1. Remove their record from SayableFriends
#   2. Optionally redact their messages in SayableMessages (or leave with [redacted] markers)
#   3. Revoke any active JWTs (clear sessions)
#
# Stub for now.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

EMAIL="${1:-}"
[ -z "$EMAIL" ] && { err "usage: $0 <email>"; exit 1; }

warn "delete_user.sh is a stub. Implement after the chat data model is stable."
warn "Tables that will need cleanup: ${TABLE_PREFIX:-Sayable}Friends, ${TABLE_PREFIX:-Sayable}Messages, ${TABLE_PREFIX:-Sayable}Sessions, ${TABLE_PREFIX:-Sayable}MoodState."
exit 1

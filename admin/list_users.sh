#!/usr/bin/env bash
# List all registered users, one line each:
#   EMAIL   NAME   ROLE   STATUS   CREATED   LAST_SEEN
#
# Read-only — scans the live SayableUsers table. Sorted by email.
#
# Usage:
#   ./admin/list_users.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../aws/_lib.sh"

require_cmd aws jq column

PREFIX="${TABLE_PREFIX:-Sayable}"
USERS="${PREFIX}Users"

# One TSV row per user; empty fields become "-" so columns stay aligned. Dates
# are trimmed to the day.
row_filter='
  .Items[]
  | {
      email: (.email.S // .emailLower.S // "-"),
      name:  (((.firstName.S // "") + " " + (.lastName.S // "")) | gsub("^ +| +$";"")),
      role:  (.role.S // "user"),
      status:(.status.S // "-"),
      created:((.createdAt.S // "") | split("T")[0]),
      seen:  ((.lastInteractionAt.S // "") | split("T")[0])
    }
  | [ .email,
      (if .name == "" then "-" else .name end),
      .role,
      .status,
      (if .created == "" then "-" else .created end),
      (if .seen == "" then "-" else .seen end)
    ]
  | @tsv
'

data=""
start=""
while :; do
  args=(--table-name "$USERS" --region "$AWS_REGION"
        --projection-expression "email, emailLower, firstName, lastName, #r, #s, createdAt, lastInteractionAt"
        --expression-attribute-names '{"#r":"role","#s":"status"}'
        --max-items 1000)
  [ -n "$start" ] && args+=(--starting-token "$start")
  resp=$(aws dynamodb scan "${args[@]}" --output json)

  page=$(echo "$resp" | jq -r "$row_filter")
  [ -n "$page" ] && data+="$page"$'\n'

  start=$(echo "$resp" | jq -r '.NextToken // empty')
  [ -z "$start" ] && break
done

data=$(printf '%s' "$data" | sed '/^$/d' | sort -f)
count=$([ -z "$data" ] && echo 0 || printf '%s\n' "$data" | wc -l | tr -d ' ')

header=$'EMAIL\tNAME\tROLE\tSTATUS\tCREATED\tLAST_SEEN'
if [ "$count" -eq 0 ]; then
  warn "No users found in $USERS."
else
  printf '%s\n%s\n' "$header" "$data" | column -t -s $'\t'
fi
info "$count user(s) — $USERS (region $AWS_REGION)"

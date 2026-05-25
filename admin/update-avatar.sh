#!/usr/bin/env bash
# Source this from your ~/.zshrc (or ~/.bashrc) to expose two helpers:
#   update_friend_avatar <friendId> <imagePath>
#   update_my_avatar <imagePath>
#
# Both upload to the deployed avatars bucket and update the BetterVibeMembers row.
#
# Add to ~/.zshrc:
#   source "/Users/muthu/Development/bettervibe/admin/update-avatar.sh"

update_friend_avatar() {
  local friendId="$1"
  local imagePath="$2"
  if [ -z "$friendId" ] || [ -z "$imagePath" ]; then
    echo "usage: update_friend_avatar <friendId> <imagePath>" >&2
    return 1
  fi
  if [ ! -f "$imagePath" ]; then
    echo "not found: $imagePath" >&2
    return 1
  fi
  local ext="${imagePath##*.}"
  ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
  case "$ext" in
    jpg|jpeg) local mime="image/jpeg"; ext="jpg" ;;
    png) local mime="image/png" ;;
    webp) local mime="image/webp" ;;
    *) echo "unsupported extension: $ext (use jpg, png, webp)" >&2; return 1 ;;
  esac

  local bucket
  bucket=$(aws cloudformation describe-stacks --stack-name BetterVibeStack \
    --query "Stacks[0].Outputs[?OutputKey=='AvatarsBucketName'].OutputValue" \
    --output text 2>/dev/null)
  if [ -z "$bucket" ] || [ "$bucket" = "None" ]; then
    echo "Could not look up AvatarsBucket from BetterVibeStack outputs." >&2
    echo "Is the stack deployed?  Run ./aws/create.sh from the repo root." >&2
    return 1
  fi

  local key="friends/${friendId}.${ext}"
  aws s3 cp "$imagePath" "s3://${bucket}/${key}" \
    --content-type "$mime" \
    --no-progress >/dev/null
  # AvatarsBucket is public-read but NOT behind CloudFront, so we serve avatars
  # from the direct S3 URL. (Character avatars are baked into the frontend
  # build and served by CloudFront — different path.)
  local region="${AWS_REGION:-us-east-1}"
  local url="https://${bucket}.s3.${region}.amazonaws.com/${key}"

  aws dynamodb update-item \
    --table-name BetterVibeMembers \
    --key "{\"memberId\":{\"S\":\"$friendId\"}}" \
    --update-expression "SET avatarUrl = :u, updatedAt = :t" \
    --expression-attribute-values "{\":u\":{\"S\":\"$url\"},\":t\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}" >/dev/null

  echo "✓ avatar set: $url"
}

update_my_avatar() {
  local imagePath="$1"
  if [ -z "$imagePath" ]; then
    echo "usage: update_my_avatar <imagePath>" >&2
    return 1
  fi

  # Look up own memberId by the owner email configured in the stack.
  local ownerEmail
  ownerEmail=$(aws cloudformation describe-stacks --stack-name BetterVibeStack \
    --query "Stacks[0].Outputs[?OutputKey=='OwnerEmail'].OutputValue" \
    --output text 2>/dev/null)
  if [ -z "$ownerEmail" ]; then
    echo "Could not look up OwnerEmail from stack outputs." >&2
    return 1
  fi
  local emailLower
  emailLower=$(echo "$ownerEmail" | tr '[:upper:]' '[:lower:]')

  local mid
  mid=$(aws dynamodb query \
    --table-name BetterVibeMembers \
    --index-name byEmail \
    --key-condition-expression "emailLower = :e" \
    --expression-attribute-values "{\":e\":{\"S\":\"$emailLower\"}}" \
    --limit 1 \
    --query "Items[0].memberId.S" \
    --output text 2>/dev/null)

  if [ -z "$mid" ] || [ "$mid" = "None" ]; then
    echo "No member row found for $ownerEmail. Sign in once at https://bettervibe.bettervibe.live first." >&2
    return 1
  fi

  update_friend_avatar "$mid" "$imagePath"
}

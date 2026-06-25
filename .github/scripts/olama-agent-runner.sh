#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="colab-agent-log.txt"
RESPONSE_FILE="colab-agent-response.json"
SESSION_LINK_FILE="colab-session-link.txt"
MAX_ITERATIONS="${COLAB_MAX_ITERATIONS:-5}"
COMMIT_BRANCH="${COMMIT_BRANCH:-colab-agent-updates}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-Apply Colab agent updates to Chikki Logs}"
COLAB_AGENT_NAME="${COLAB_AGENT_NAME:-chikki-logs-agent}"
COLAB_API_URL="${COLAB_API_URL:-}"
COLAB_API_TOKEN="${COLAB_API_TOKEN:-}"
SESSION_PROMPT="${SESSION_PROMPT:-}"

rm -f "$LOG_FILE" "$RESPONSE_FILE" "$SESSION_LINK_FILE"

echo "Starting Colab agent runner" | tee "$LOG_FILE"

if [ -z "$COLAB_API_URL" ]; then
  echo "ERROR: COLAB_API_URL is required" | tee -a "$LOG_FILE"
  exit 1
fi
if [ -z "$COLAB_API_TOKEN" ]; then
  echo "ERROR: COLAB_API_TOKEN is required" | tee -a "$LOG_FILE"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not inside a git repository" | tee -a "$LOG_FILE"
  exit 1
fi

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git checkout -B "$COMMIT_BRANCH"

CURRENT_PROMPT="${SESSION_PROMPT:-You are an agentic AI developer assigned to complete the Chikki Logs project. Review the repository and plan the next development steps. Implement code changes automatically and iterate until the project is complete. After each iteration, return JSON with fields: done, patch, next_prompt, session_url, summary.}" 

apply_patch() {
  local patch_file="$1"
  if git apply --ignore-whitespace --ignore-space-change "$patch_file" 2>> "$LOG_FILE"; then
    if [ -n "$(git status --porcelain)" ]; then
      git add -A
      git commit -m "$COMMIT_MESSAGE"
      git push origin "$COMMIT_BRANCH"
      echo "Committed and pushed iteration changes to $COMMIT_BRANCH" | tee -a "$LOG_FILE"
      return 0
    else
      echo "Patch applied but no working tree changes detected" | tee -a "$LOG_FILE"
      return 1
    fi
  else
    echo "ERROR: failed to apply patch" | tee -a "$LOG_FILE"
    return 1
  fi
}

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo "\n=== Iteration $i ===" | tee -a "$LOG_FILE"

  rm -f repo-archive.tar.gz
  tar --exclude=.git -czf repo-archive.tar.gz .

  PAYLOAD_FILE=$(mktemp)
  trap 'rm -f "$PAYLOAD_FILE"' EXIT
  cat > "$PAYLOAD_FILE" <<EOF
{
  "session_id": "session-$(date -u +%Y%m%dT%H%M%SZ)",
  "agent": "${COLAB_AGENT_NAME}",
  "prompt": "${CURRENT_PROMPT}",
  "commit_branch": "${COMMIT_BRANCH}",
  "commit_message": "${COMMIT_MESSAGE}",
  "iteration": $i
}
EOF

  HTTP_RESPONSE=$(mktemp)
  HTTP_STATUS=$(curl -sS -w "%{http_code}" -o "$HTTP_RESPONSE" \
    -H "Authorization: Bearer ${COLAB_API_TOKEN}" \
    -F "metadata=@${PAYLOAD_FILE};type=application/json" \
    -F "repo_archive=@repo-archive.tar.gz;type=application/gzip" \
    "$COLAB_API_URL")

  cat "$HTTP_RESPONSE" > "$RESPONSE_FILE"
  echo "API HTTP status: $HTTP_STATUS" | tee -a "$LOG_FILE"
  echo "API response saved to $RESPONSE_FILE" | tee -a "$LOG_FILE"

  if [ "$HTTP_STATUS" -lt 200 ] || [ "$HTTP_STATUS" -ge 300 ]; then
    echo "ERROR: API request failed with status $HTTP_STATUS" | tee -a "$LOG_FILE"
    exit 1
  fi

  NEXT_PROMPT=$(python3 - <<PY
import json, os
with open('$RESPONSE_FILE') as f:
    data = json.load(f)
print(data.get('next_prompt', '') or '')
PY
)
  DONE_FLAG=$(python3 - <<PY
import json, os
with open('$RESPONSE_FILE') as f:
    data = json.load(f)
print(str(data.get('done', False)).lower())
PY
)
  SESSION_URL=$(python3 - <<PY
import json, os
with open('$RESPONSE_FILE') as f:
    data = json.load(f)
print(data.get('session_url', '') or '')
PY
)
  PATCH_CONTENT=$(python3 - <<PY
import json, os
with open('$RESPONSE_FILE') as f:
    data = json.load(f)
print(data.get('patch', '') or '')
PY
)

  if [ -n "$SESSION_URL" ]; then
    printf '%s\n' "$SESSION_URL" | tee "$SESSION_LINK_FILE"
  fi

  if [ -n "$PATCH_CONTENT" ]; then
    PATCH_FILE=$(mktemp)
    printf '%s' "$PATCH_CONTENT" > "$PATCH_FILE"
    if apply_patch "$PATCH_FILE"; then
      echo "Applied patch for iteration $i" | tee -a "$LOG_FILE"
    else
      echo "Failed to apply patch for iteration $i" | tee -a "$LOG_FILE"
      exit 1
    fi
  else
    echo "No patch returned by agent at iteration $i" | tee -a "$LOG_FILE"
  fi

  if [ "$DONE_FLAG" = "true" ]; then
    echo "Agent marked the work complete." | tee -a "$LOG_FILE"
    break
  fi

  if [ -n "$NEXT_PROMPT" ]; then
    CURRENT_PROMPT="$NEXT_PROMPT"
    echo "Next prompt for iteration $((i+1)): $CURRENT_PROMPT" | tee -a "$LOG_FILE"
  else
    echo "No next_prompt returned. Ending after iteration $i." | tee -a "$LOG_FILE"
    break
  fi

done

if [ -f "$SESSION_LINK_FILE" ]; then
  echo "Session link available in $SESSION_LINK_FILE" | tee -a "$LOG_FILE"
fi

echo "Colab agent runner complete" | tee -a "$LOG_FILE"

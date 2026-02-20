#!/usr/bin/env bash
# Usage: ./scripts/delete_study.sh <orthanc-study-id>
# Deletes a study from Orthanc by its internal Orthanc resource ID.
# To list all Orthanc study IDs: curl http://localhost:8042/studies

set -euo pipefail

ORTHANC_URL="${ORTHANC_URL:-http://localhost:8042}"
STUDY_ID="${1:?Usage: $0 <orthanc-study-id>}"

echo "Deleting Orthanc study: $STUDY_ID"

HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
  -X DELETE \
  "${ORTHANC_URL}/studies/${STUDY_ID}")

if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "Deleted successfully (HTTP 200)"
else
  echo "ERROR: HTTP $HTTP_STATUS" >&2
  exit 1
fi

echo ""
echo "The core service poller will soft-delete this study in PostgreSQL within POLL_INTERVAL seconds."
echo "Verify: curl http://localhost:8001/studies?include_deleted=true | python3 -m json.tool"

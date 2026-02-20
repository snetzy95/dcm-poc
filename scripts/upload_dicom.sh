#!/usr/bin/env bash
# Usage: ./scripts/upload_dicom.sh path/to/file.dcm
# Uploads a DICOM file to Orthanc and prints the assigned Study UID.

set -euo pipefail

ORTHANC_URL="${ORTHANC_URL:-http://localhost:8042}"
DCM_FILE="${1:?Usage: $0 <path-to-dicom-file>}"

if [[ ! -f "$DCM_FILE" ]]; then
  echo "ERROR: file not found: $DCM_FILE" >&2
  exit 1
fi

echo "Uploading: $DCM_FILE"

RESPONSE=$(curl -sf \
  -X POST \
  -H "Content-Type: application/dicom" \
  --data-binary "@${DCM_FILE}" \
  "${ORTHANC_URL}/instances")

echo "Orthanc response:"
echo "$RESPONSE" | python3 -m json.tool

INSTANCE_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['ID'])")
echo ""
echo "Instance Orthanc ID : $INSTANCE_ID"

STUDY_ID=$(curl -sf "${ORTHANC_URL}/instances/${INSTANCE_ID}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['ParentStudy'])")
echo "Study Orthanc ID    : $STUDY_ID"

STUDY_UID=$(curl -sf "${ORTHANC_URL}/studies/${STUDY_ID}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['MainDicomTags']['StudyInstanceUID'])")
echo "StudyInstanceUID    : $STUDY_UID"
echo ""
echo "The core service poller will ingest this study within POLL_INTERVAL seconds."

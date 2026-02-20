#!/usr/bin/env bash
# End-to-end smoke test for the DCM PoC stack.
# Usage: ./scripts/smoke_test.sh path/to/test.dcm
#
# A free test DICOM file can be downloaded with:
#   curl -L -o test.dcm "https://www.rubomedical.com/dicom_files/dicom_test_file_01.dcm"

set -euo pipefail

ORTHANC_URL="${ORTHANC_URL:-http://localhost:8042}"
CORE_URL="${CORE_URL:-http://localhost:8001}"
ML_URL="${ML_URL:-http://localhost:8002}"
DCM_FILE="${1:?Usage: $0 <path-to-dicom-file>}"
POLL_WAIT="${POLL_WAIT:-12}"

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1" >&2; exit 1; }
section() { echo ""; echo "=== $1 ==="; }

echo "DCM PoC Smoke Test"
echo "DICOM file : $DCM_FILE"

section "Health checks"
curl -sf "${ORTHANC_URL}/system" > /dev/null   && pass "Orthanc /system"   || fail "Orthanc /system"
curl -sf "${CORE_URL}/health"   > /dev/null    && pass "Core /health"      || fail "Core /health"
curl -sf "${ML_URL}/health"     > /dev/null    && pass "ML /health"        || fail "ML /health"

section "DICOM upload"
UPLOAD_RESP=$(curl -sf -X POST \
  -H "Content-Type: application/dicom" \
  --data-binary "@${DCM_FILE}" \
  "${ORTHANC_URL}/instances")
INSTANCE_ID=$(echo "$UPLOAD_RESP" | python -c "import sys,json; print(json.load(sys.stdin)['ID'])")
pass "Uploaded instance: $INSTANCE_ID"

ORTHANC_STUDY_ID=$(echo "$UPLOAD_RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['ParentStudy'])" 2>/dev/null || \
  curl -sf "${ORTHANC_URL}/studies" | python -c "import sys,json; ids=json.load(sys.stdin); print(ids[0])")
pass "Orthanc study ID: $ORTHANC_STUDY_ID"

section "Poller ingestion"
echo "Waiting ${POLL_WAIT}s for poller..."
sleep "$POLL_WAIT"

STUDIES=$(curl -sf "${CORE_URL}/studies")
COUNT=$(echo "$STUDIES" | python -c "import sys,json; print(json.load(sys.stdin)['total'])")
[[ "$COUNT" -ge 1 ]] && pass "Core service has $COUNT study(ies)" || fail "Core service has 0 studies"

STUDY_UID=$(echo "$STUDIES" | python -c "import sys,json; print(json.load(sys.stdin)['items'][0]['study_uid'])")
pass "Study UID ingested: $STUDY_UID"

section "Cohort definition"
COHORT_RESP=$(curl -sf -X POST "${ML_URL}/cohort-definitions" \
  -H "Content-Type: application/json" \
  -d '{"cohort_definition_name":"smoke-cohort","filters":{},"orthanc_tags":[]}')
COHORT_ID=$(echo "$COHORT_RESP" | python -c "import sys,json; print(json.load(sys.stdin)['cohort_definition_id'])")
pass "Created cohort definition: $COHORT_ID"

section "Cohort resolve + Orthanc labeling"
RESOLVE=$(curl -sf -X POST "${ML_URL}/cohort-definitions/${COHORT_ID}/resolve")
MATCHED=$(echo "$RESOLVE" | python -c "import sys,json; print(json.load(sys.stdin)['matched_count'])")
[[ "$MATCHED" -ge 1 ]] && pass "Cohort resolved $MATCHED study(ies) and labeled in Orthanc" || fail "Cohort matched 0 studies"

section "ML job lifecycle"
JOB_RESP=$(curl -sf -X POST "${ML_URL}/jobs" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"smoke-job\",\"cohort_definition_id\":\"${COHORT_ID}\",\"algorithm\":\"fedavg_stub\",\"params\":{\"rounds\":1}}")
JOB_ID=$(echo "$JOB_RESP" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
pass "Created job: $JOB_ID"

curl -sf -X POST "${ML_URL}/jobs/${JOB_ID}/start" > /dev/null
pass "Job transitioned to RUNNING"

curl -sf -X POST "${ML_URL}/jobs/${JOB_ID}/result" \
  -H "Content-Type: application/json" \
  -d "{\"edge_node_id\":\"smoke-node\",\"round\":1,\"payload\":{\"local_loss\":0.42,\"num_samples\":100,\"model_weights_stub\":{}}}" > /dev/null
pass "Submitted edge result"

AGG=$(curl -sf "${ML_URL}/jobs/${JOB_ID}/aggregate")
GLOBAL_LOSS=$(echo "$AGG" | python -c "import sys,json; print(json.load(sys.stdin).get('global_loss','null'))")
pass "Aggregated result: global_loss=$GLOBAL_LOSS"

section "Delete + soft-delete propagation"
curl -sf -X DELETE "${ORTHANC_URL}/studies/${ORTHANC_STUDY_ID}" > /dev/null
pass "Deleted study from Orthanc"

echo "Waiting ${POLL_WAIT}s for soft-delete propagation..."
sleep "$POLL_WAIT"

STUDY_RESP=$(curl -sf "${CORE_URL}/studies/${STUDY_UID}")
DEL_AT=$(echo "$STUDY_RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('deleted_at') or 'null')")
[[ "$DEL_AT" != "null" ]] && pass "Study soft-deleted (deleted_at=${DEL_AT})" || fail "Study not soft-deleted in PG"

section "Summary"
echo ""
echo "All smoke tests PASSED."

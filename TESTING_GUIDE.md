# DCM PoC — Testing Guide

---

## 1. Unit Tests

### Run — dcm-core-service

```bash
cd dcm-poc/dcm-core-service

# Install dependencies (once)
pip install -r requirements.txt

# Run all unit tests
pytest

# Run with verbose output
pytest -v

# Run a specific test file
pytest tests/test_webhook_api.py -v
pytest tests/test_orthanc_poller.py -v
pytest tests/test_parse_helpers.py -v
pytest tests/test_studies_api_filters.py -v
```

### Run — dcm-ml-service

```bash
cd dcm-poc/dcm-ml-service

pip install -r requirements.txt

pytest

pytest -v

pytest tests/test_orthanc_labeler.py -v
pytest tests/test_federated_coordinator.py -v
pytest tests/test_jobs_api_extended.py -v
pytest tests/test_cohorts_api_extended.py -v
```

### New test files added (summary)

| Service | File | What it covers |
|---|---|---|
| core | `test_webhook_api.py` | StableStudy, DeletedStudy, unknown type, missing fields |
| core | `test_orthanc_poller.py` | `_get_last_seq`, `_save_last_seq`, `_dispatch` for all event types |
| core | `test_parse_helpers.py` | `_parse_time`, `_parse_date` edge cases, `_safe_int` |
| core | `test_studies_api_filters.py` | Pagination, `include_deleted`, 422 guard-rails, series in response |
| ml | `test_orthanc_labeler.py` | add/remove label, 404 silence, metadata write, `_label` format |
| ml | `test_federated_coordinator.py` | `can_transition` FSM, aggregate averages, dedup, missing fields |
| ml | `test_jobs_api_extended.py` | submit result (happy/conflict/not-found), list, aggregate → DONE |
| ml | `test_cohorts_api_extended.py` | update, delete (label cleanup), members list/delete, resolve multi |

---

## 2. Deployment Stack

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Ports free: **3000, 4242, 8001, 8002, 8042, 9090, 3001**

### Start the full stack

```bash
cd dcm-poc

docker compose up --build -d
```

> First start downloads ~1.5 GB of images and builds Python/Node images; allow 5–10 min.

### Watch logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f dcm-core-service
docker compose logs -f orthanc
```

### Check health

```bash
curl http://localhost:8001/health   # {"status":"ok","service":"dcm-core-service"}
curl http://localhost:8002/health   # {"status":"ok","service":"dcm-ml-service"}
curl http://localhost:8042/system   # Orthanc system info JSON
```

### Stop the stack

```bash
docker compose down
```

### Full reset (wipe data volumes)

```bash
docker compose down -v
```

---

## 3. Service URLs & Credentials

| Service | URL | Credentials |
|---|---|---|
| **SPA (React)** | http://localhost:3000 | — |
| **Orthanc REST API** | http://localhost:8042 | No auth (AuthenticationEnabled: false) |
| **Orthanc DICOM** | localhost:4242 | No auth |
| **DCM Core API** | http://localhost:8001 | — |
| **DCM ML API** | http://localhost:8002 | — |
| **Prometheus** | http://localhost:9090 | — |
| **Grafana** | http://localhost:3001 | admin / admin |
| **PostgreSQL** | localhost:5432 | dcm / dcmpassword / dcmdb |

---

## 4. Manual Test Checklist

Get a sample DICOM file before starting (if you don't have one):

```bash
curl -L -o /tmp/test.dcm \
  "https://www.rubomedical.com/dicom_files/dicom_test_file_01.dcm"
```

---

### Feature 1 — DICOM Upload & Automatic Ingestion

**Goal:** Upload a DICOM file to Orthanc → core-service auto-ingests it → visible in SPA.

#### Steps

1. Open **http://localhost:3000/upload** in a browser.
2. Drag-and-drop `test.dcm` onto the upload zone, or click to select.
3. Expect green message: `Instance ID: <some-id>`.

**Alternative — direct curl upload:**
```bash
curl -X POST http://localhost:8042/instances \
  -H "Content-Type: application/dicom" \
  --data-binary @/tmp/test.dcm
```

4. Wait ~10 seconds for the poller to process the `StableStudy` event.
5. Open **http://localhost:3000** (Studies page) — the study should appear in the table.

**DB verification:**
```bash
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb -c \
  "SELECT study_uid, patient_name, study_date, num_series, num_instances, ingested_at FROM studies ORDER BY ingested_at DESC LIMIT 5;"
```

**API verification:**
```bash
curl -s http://localhost:8001/studies | python3 -m json.tool | head -60
```

---

### Feature 2 — Studies API Filtering

**Goal:** Confirm that filter parameters narrow results.

```bash
# Filter by modality (e.g. CT)
curl "http://localhost:8001/studies?modality=CT"

# Filter by sex
curl "http://localhost:8001/studies?patient_sex=M"

# Filter by institution name (partial match)
curl "http://localhost:8001/studies?institution_name=Hospital"

# Filter by date range
curl "http://localhost:8001/studies?study_date_from=2020-01-01&study_date_to=2025-12-31"

# Paginate
curl "http://localhost:8001/studies?page=1&page_size=5"
```

**SPA check:**
- Open http://localhost:3000
- Use the filter inputs (Modality, Sex, Date From/To, Institution)
- Verify the table updates with each filter change

---

### Feature 3 — Study Detail with Series & Instances

**Get full study detail:**
```bash
STUDY_UID=$(curl -s http://localhost:8001/studies | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['study_uid'])")

curl -s "http://localhost:8001/studies/${STUDY_UID}" | python3 -m json.tool
```

Expected: Response includes `series[]` array with `instances[]` nested inside each series.

---

### Feature 4 — Orthanc Viewer (DICOM Viewer)

**Goal:** View uploaded images in Orthanc's built-in viewer.

1. Open http://localhost:8042/ui/app/ in a browser.
2. You should see the study listed under "Studies" in the Orthanc Explorer.
3. Click the study → click a series → click "Preview" or "OHIF" to view images.

**DB check — Orthanc stores index in PG:**
```bash
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Instance%' OR tablename LIKE 'Study%' LIMIT 20;"
```

---

### Feature 5 — Webhook (Optional — Orthanc Change Events via HTTP Push)

The stack uses polling by default. To test the webhook path directly:

```bash
# Simulate a StableStudy event
STUDY_UID=$(curl -s http://localhost:8001/studies | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0]['orthanc_id'] if d['items'] else 'missing')")

curl -X POST http://localhost:8001/webhook/orthanc \
  -H "Content-Type: application/json" \
  -d "{
    \"ChangeType\": \"StableStudy\",
    \"ID\": \"${STUDY_UID}\",
    \"Path\": \"/studies/${STUDY_UID}\",
    \"ResourceType\": \"Study\",
    \"Date\": \"20230615T120000\"
  }"
```

Expected: `{"received":"StableStudy","id":"<id>"}` — 200 response.

---

### Feature 6 — Cohort Definition (Create & List)

**Via SPA:**
1. Open http://localhost:3000/cohorts
2. Click **"+ New Cohort"**
3. Enter a name, optionally set filters (e.g. Modality = CT)
4. Click **"Create"**
5. The new cohort appears in the left sidebar

**Via API:**
```bash
curl -X POST http://localhost:8002/cohort-definitions \
  -H "Content-Type: application/json" \
  -d '{
    "cohort_definition_name": "CT Studies 2023",
    "filters": {
      "modalities": ["CT"],
      "study_date_from": "2023-01-01",
      "study_date_to": "2023-12-31"
    },
    "orthanc_tags": []
  }'
```

**List all cohort definitions:**
```bash
curl -s http://localhost:8002/cohort-definitions | python3 -m json.tool
```

**DB check:**
```bash
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb -c \
  "SELECT cohort_definition_id, cohort_definition_name, filters FROM cohort_definition;"
```

---

### Feature 7 — Cohort Resolution & Orthanc Labeling

**Via SPA:**
1. Open http://localhost:3000/cohorts
2. Select a cohort from the left sidebar
3. Click **"Resolve Cohort"**
4. A green banner shows: `X studies matched and labeled in Orthanc`
5. The Members section shows the matched study UIDs

**Via API (get the cohort ID first):**
```bash
COHORT_ID=$(curl -s http://localhost:8002/cohort-definitions | \
  python3 -c "import sys,json; print(json.load(sys.stdin)[0]['cohort_definition_id'])")

curl -X POST "http://localhost:8002/cohort-definitions/${COHORT_ID}/resolve"
```

**Verify label in Orthanc:**
```bash
# Get Orthanc study ID
ORTHANC_STUDY_ID=$(curl -s http://localhost:8001/studies | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['orthanc_id'])")

# Check labels on this study
curl "http://localhost:8042/studies/${ORTHANC_STUDY_ID}/labels"
# Expected: ["cohort:<uuid>"]
```

**Verify membership in DB:**
```bash
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb -c \
  "SELECT cohort_definition_id, subject_id, orthanc_study_id, added_at FROM cohort;"
```

**Sync-check — verify Orthanc agrees with DB:**
```bash
curl "http://localhost:8002/cohorts/${COHORT_ID}/orthanc"
# Returns list of Orthanc study IDs carrying the cohort label
```

---

### Feature 8 — Cohort Update & Delete

**Update cohort name:**
```bash
curl -X PUT "http://localhost:8002/cohort-definitions/${COHORT_ID}" \
  -H "Content-Type: application/json" \
  -d '{"cohort_definition_name": "Renamed Cohort"}'
```

**Delete cohort (removes label from Orthanc, deletes DB rows):**
```bash
curl -X DELETE "http://localhost:8002/cohort-definitions/${COHORT_ID}"
# Expected: 204 No Content

# Confirm label removed from Orthanc
curl "http://localhost:8042/studies/${ORTHANC_STUDY_ID}/labels"
# Expected: [] (empty)

# Confirm DB cleaned up
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb -c \
  "SELECT COUNT(*) FROM cohort WHERE cohort_definition_id = '${COHORT_ID}';"
# Expected: 0
```

---

### Feature 9 — Federated ML Job Lifecycle

**Via SPA:**
1. Open http://localhost:3000/jobs
2. Click **"+ New Job"**
3. Enter a name, select algorithm `fedavg_stub`, pick a cohort (optional), set rounds
4. Click **"Create Job"** — appears with status `PENDING`
5. Click **"Start"** button — status changes to `RUNNING`

**Via API (full lifecycle):**
```bash
# Create a job
JOB_RESP=$(curl -s -X POST http://localhost:8002/jobs \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"test-fedavg-job\",
    \"algorithm\": \"fedavg_stub\",
    \"params\": {\"rounds\": 2}
  }")
JOB_ID=$(echo $JOB_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Job ID: $JOB_ID"

# Start the job
curl -X POST "http://localhost:8002/jobs/${JOB_ID}/start"
# Expected: job status = RUNNING

# Submit edge node result (round 1, node 1)
curl -X POST "http://localhost:8002/jobs/${JOB_ID}/result" \
  -H "Content-Type: application/json" \
  -d '{
    "edge_node_id": "edge-node-1",
    "round": 1,
    "payload": {"local_loss": 0.42, "num_samples": 150, "model_weights_stub": {}}
  }'

# Submit from a second node
curl -X POST "http://localhost:8002/jobs/${JOB_ID}/result" \
  -H "Content-Type: application/json" \
  -d '{
    "edge_node_id": "edge-node-2",
    "round": 1,
    "payload": {"local_loss": 0.35, "num_samples": 200, "model_weights_stub": {}}
  }'

# Aggregate results (sets status → DONE)
curl -s "http://localhost:8002/jobs/${JOB_ID}/aggregate" | python3 -m json.tool
# Expected: global_loss=0.385, total_samples=350, num_nodes=2, status=DONE
```

**DB check:**
```bash
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb -c \
  "SELECT id, name, status, result_summary, started_at, finished_at FROM ml_jobs ORDER BY created_at DESC LIMIT 5;"

docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb -c \
  "SELECT edge_node_id, round, payload FROM job_edge_results WHERE job_id = '${JOB_ID}';"
```

**Conflict guard test — try to start DONE job:**
```bash
curl -X POST "http://localhost:8002/jobs/${JOB_ID}/start"
# Expected: 409 Conflict
```

---

### Feature 10 — Soft Delete Propagation

**Delete study from Orthanc and verify soft-delete in PG:**
```bash
ORTHANC_STUDY_ID=$(curl -s http://localhost:8001/studies | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['orthanc_id'])")

STUDY_UID=$(curl -s http://localhost:8001/studies | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['study_uid'])")

# Delete from Orthanc
curl -X DELETE "http://localhost:8042/studies/${ORTHANC_STUDY_ID}"

# Wait for poller (~10 seconds)
sleep 12

# Check study is soft-deleted (deleted_at set)
curl -s "http://localhost:8001/studies/${STUDY_UID}" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('deleted_at:', d.get('deleted_at'))"

# Studies list by default hides deleted — verify it's gone
curl -s http://localhost:8001/studies | \
  python3 -c "import sys,json; print('total:', json.load(sys.stdin)['total'])"

# Show deleted study with include_deleted=true
curl -s "http://localhost:8001/studies?include_deleted=true" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); [print(s['study_uid'], s['deleted_at']) for s in d['items']]"

# DB check
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb -c \
  "SELECT study_uid, deleted_at FROM studies WHERE deleted_at IS NOT NULL;"
```

---

### Feature 11 — Monitoring (Prometheus & Grafana)

**Prometheus:**
1. Open http://localhost:9090
2. In the search bar, query: `dcm_studies_ingested_total`
3. Click **Execute** — should show counter > 0 after upload
4. Query `dcm_poller_last_seq` to see the change sequence
5. Query `dcm_poller_lag_seconds` — should be 0 on a healthy stack

**Grafana:**
1. Open http://localhost:3001
2. Login: admin / admin (skip password change)
3. Navigate to **Dashboards → Browse** — look for pre-provisioned DCM dashboards
4. Verify metrics panels show data

**Metrics endpoint check:**
```bash
curl http://localhost:8001/metrics | grep dcm_studies
curl http://localhost:8002/metrics | grep dcm_cohort
```

---

## 5. Smoke Test Script

The `scripts/smoke_test.sh` automates steps 1–10 end-to-end:

```bash
cd dcm-poc
chmod +x scripts/smoke_test.sh
./scripts/smoke_test.sh /tmp/test.dcm
```

Expected output: `All smoke tests PASSED.`

---

## 6. Postgres Direct Access

```bash
# Connect to the database
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb

# Useful queries
\dt                                  -- list all tables
SELECT * FROM studies LIMIT 5;
SELECT * FROM series LIMIT 5;
SELECT * FROM instances LIMIT 5;
SELECT * FROM cohort_definition;
SELECT * FROM cohort;
SELECT * FROM ml_jobs;
SELECT * FROM job_edge_results;
SELECT * FROM poller_state;          -- shows last processed Orthanc change seq
```

# DCM PoC — Testing Guide

> **Shell note:** Every command in this guide runs in **Windows CMD** (`cmd.exe`) unless
> a section is explicitly labelled "Git Bash only". No bash, no PowerShell needed.
>
> **CMD placeholder rule:** Anywhere you see `<SOME_VALUE>` you MUST replace the entire
> `<SOME_VALUE>` token (including the angle brackets) with the real value before pressing Enter.
> In CMD the `<` and `>` characters are I/O redirection operators — leaving them in the command
> will cause a "The system cannot find the file specified" error.

---

## 1. Unit Tests

```cmd
cd dcm-poc\dcm-core-service
pip install -r requirements.txt
pytest -v
```

```cmd
cd dcm-poc\dcm-ml-service
pip install -r requirements.txt
pytest -v
```

**Expected:** `dcm-core-service` 44 passed · `dcm-ml-service` 54 passed

### Test files summary

| Service | File | What it covers |
|---|---|---|
| core | `test_webhook_api.py` | StableStudy, DeletedStudy, unknown type, missing fields |
| core | `test_orthanc_poller.py` | `_get_last_seq`, `_save_last_seq`, `_dispatch`, `_reconcile_deletions` |
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

```cmd
cd dcm-poc
docker compose up --build -d
```

> First start downloads ~1.5 GB of images and builds Python/Node images; allow 5–10 min.

### Watch logs

```cmd
docker compose logs -f
docker compose logs -f dcm-core-service
docker compose logs -f orthanc
```

### Check health

```cmd
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8042/system
```

### Stop / reset

```cmd
docker compose down
docker compose down -v
```

---

## 3. Service URLs & Credentials

| Service | URL | Credentials |
|---|---|---|
| **SPA (React)** | http://localhost:3000 | — |
| **Orthanc REST API** | http://localhost:8042 | No auth |
| **Orthanc DICOM** | localhost:4242 | No auth |
| **DCM Core API** | http://localhost:8001 | — |
| **DCM ML API** | http://localhost:8002 | — |
| **Prometheus** | http://localhost:9090 | — |
| **Grafana** | http://localhost:3001 | admin / admin |
| **PostgreSQL** | localhost:5432 | dcm / dcmpassword / dcmdb |

---

## 4. Manual Test Checklist

### Get a sample DICOM file

Generate one with Python (each run produces unique UIDs — required by Orthanc):

```cmd
python -c "import pydicom,time; from pydicom.dataset import FileDataset; from pydicom.uid import generate_uid; import pydicom.uid; sop=generate_uid(); m=pydicom.dataset.FileMetaDataset(); m.MediaStorageSOPClassUID='1.2.840.10008.5.1.4.1.1.2'; m.MediaStorageSOPInstanceUID=sop; m.TransferSyntaxUID=pydicom.uid.ExplicitVRLittleEndian; ds=FileDataset('test.dcm',{},file_meta=m,preamble=b'\x00'*128); ds.is_implicit_VR=False; ds.is_little_endian=True; ts=str(int(time.time())); ds.PatientName='Test^'+ts; ds.PatientID='T'+ts; ds.PatientSex='M'; ds.StudyDate='20260101'; ds.StudyTime='120000'; ds.StudyInstanceUID=generate_uid(); ds.SeriesInstanceUID=generate_uid(); ds.SOPInstanceUID=sop; ds.SOPClassUID=m.MediaStorageSOPClassUID; ds.Modality='CT'; ds.InstitutionName='TestHospital'; ds.StudyDescription='Test'; ds.SeriesNumber='1'; ds.InstanceNumber='1'; ds.Rows=8; ds.Columns=8; ds.BitsAllocated=8; ds.BitsStored=8; ds.HighBit=7; ds.PixelRepresentation=0; ds.SamplesPerPixel=1; ds.PhotometricInterpretation='MONOCHROME2'; ds.PixelData=bytes(64); pydicom.dcmwrite('test.dcm',ds); print('Created test.dcm')"
```

---

### Feature 1 — DICOM Upload & Automatic Ingestion

**Goal:** Upload a DICOM file → core-service ingests it → visible in SPA.

1. Open **http://localhost:3000/upload** — drag-and-drop `test.dcm`.
2. Expect green message: `Instance ID: <some-id>`.

**Or upload via curl:**
```cmd
curl -X POST http://localhost:8042/instances -H "Content-Type: application/dicom" --data-binary @test.dcm
```

3. **Wait ~75 seconds.** Orthanc waits ~60 s before emitting `StableStudy`; the poller picks it up within 5 s.
4. Open **http://localhost:3000** — the study should appear.

**DB check:**
```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT study_uid, patient_name, study_date, num_series, num_instances, ingested_at FROM studies ORDER BY ingested_at DESC LIMIT 5;"
```

**API check:**
```cmd
curl -s http://localhost:8001/studies | python -m json.tool
```

---

### Feature 2 — Studies API Filtering

```cmd
curl "http://localhost:8001/studies?modality=CT"
curl "http://localhost:8001/studies?patient_sex=M"
curl "http://localhost:8001/studies?institution_name=Hospital"
curl "http://localhost:8001/studies?study_date_from=2020-01-01&study_date_to=2025-12-31"
curl "http://localhost:8001/studies?page=1&page_size=5"
```

**SPA:** Open http://localhost:3000 and use the filter inputs.

---

### Feature 3 — Study Detail with Series & Instances

Step 1 — get a study UID:
```cmd
curl -s http://localhost:8001/studies | python -c "import sys,json; print(json.load(sys.stdin)['items'][0]['study_uid'])"
```

Step 2 — copy the printed UID, then query the detail (replace `<UID>` with the value):
```cmd
curl -s "http://localhost:8001/studies/<UID>" | python -m json.tool
```

Expected: response contains `series[]` with `instances[]` nested inside.

---

### Feature 4 — Orthanc Viewer

1. Open http://localhost:8042/ui/app/
2. Find the study → click a series → click **Preview** or **OHIF**.

**DB check (Orthanc schema tables):**
```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT tablename FROM pg_tables WHERE schemaname='public' LIMIT 30;"
```

---

### Feature 5 — Webhook (Optional)

The stack uses polling by default. To simulate a webhook event manually, first get an Orthanc ID:

```cmd
curl -s http://localhost:8001/studies | python -c "import sys,json; print(json.load(sys.stdin)['items'][0]['orthanc_id'])"
```

Copy the printed ID, then send the webhook — paste the real ID in place of the angle-bracket placeholder.

> **CMD warning:** `<` and `>` are redirection operators in CMD. You MUST replace `<ORTHANC_ID>`
> with the actual value (e.g. `ea825ff5-6acaf08d-fa0bb01e-850fb445-d8772491`) before running.

Example (substitute your real orthanc_id):
```cmd
curl -X POST http://localhost:8001/webhook/orthanc -H "Content-Type: application/json" -d "{\"ChangeType\":\"StableStudy\",\"ID\":\"ea825ff5-6acaf08d-fa0bb01e-850fb445-d8772491\",\"Path\":\"/studies/ea825ff5-6acaf08d-fa0bb01e-850fb445-d8772491\",\"ResourceType\":\"Study\",\"Date\":\"20230615T120000\"}"
```

Expected response: `{"received":"StableStudy","id":"ea825ff5-..."}`

---

### Feature 6 — Cohort Definition (Create & List)

**Via SPA:** http://localhost:3000/cohorts → **+ New Cohort**

**Via API — create:**
```cmd
curl -X POST http://localhost:8002/cohort-definitions -H "Content-Type: application/json" -d "{\"cohort_definition_name\":\"CT Studies\",\"filters\":{\"modalities\":[\"CT\"]},\"orthanc_tags\":[]}"
```

> **Note:** Do NOT add `study_date_from`/`study_date_to` here — studies uploaded via the test DICOM
> generator have `StudyDate=20260101` or null, so a 2023 date range would match zero studies.

**List:**
```cmd
curl -s http://localhost:8002/cohort-definitions | python -m json.tool
```

Get and store a cohort ID for the next steps:
```cmd
curl -s http://localhost:8002/cohort-definitions | python -c "import sys,json; print(json.load(sys.stdin)[0]['cohort_definition_id'])"
```
> Copy the printed UUID — you will need it as `<COHORT_ID>` below.

**DB check:**
```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT cohort_definition_id, cohort_definition_name, filters FROM cohort_definition;"
```

---

### Feature 7 — Cohort Resolution & Orthanc Labeling

Replace `<COHORT_ID>` with the UUID from Feature 6.

**Resolve (via API):**
```cmd
curl -X POST "http://localhost:8002/cohort-definitions/<COHORT_ID>/resolve"
```

**Get the Orthanc study ID of a resolved cohort member for label verification:**

The resolve response above contains a `study_uids` list. Cross-reference it with the core API to get the matching `orthanc_id`:
```cmd
curl -s "http://localhost:8002/cohorts/<COHORT_ID>/orthanc"
```
> This returns the list of Orthanc study IDs that are actually in the cohort.
> Copy the **first value** from that list as `<ORTHANC_STUDY_ID>`.

> **Why not use `items[0]` from `/studies`?** That endpoint returns studies sorted by ingestion
> time, so `items[0]` may be a study with a different modality (e.g. MR) that is not part of
> your CT cohort. Always use the cohort members list to pick the right study for label checks.

**Check labels on the resolved study (replace `<ORTHANC_STUDY_ID>`):**
```cmd
curl "http://localhost:8042/studies/<ORTHANC_STUDY_ID>/labels"
```
Expected: `["cohort_<uuid>"]` (underscore, not colon — Orthanc label format requirement)

**DB check:**
```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT cohort_definition_id, subject_id, orthanc_study_id, added_at FROM cohort;"
```

**Sync-check:**
```cmd
curl "http://localhost:8002/cohorts/<COHORT_ID>/orthanc"
```

---

### Feature 8 — Cohort Update & Delete

Replace `<COHORT_ID>` with the UUID from Feature 6, and `<ORTHANC_STUDY_ID>` with a cohort member Orthanc ID from the `/cohorts/<COHORT_ID>/orthanc` list (NOT `items[0]` from `/studies`).

**Rename:**
```cmd
curl -X PUT "http://localhost:8002/cohort-definitions/<COHORT_ID>" -H "Content-Type: application/json" -d "{\"cohort_definition_name\":\"Renamed Cohort\"}"
```

**Delete:**
```cmd
curl -X DELETE "http://localhost:8002/cohort-definitions/<COHORT_ID>"
```
Expected: 204 No Content

**Verify label removed from Orthanc:**
```cmd
curl "http://localhost:8042/studies/<ORTHANC_STUDY_ID>/labels"
```
Expected: `[]`

**Verify DB cleaned up (replace `<COHORT_ID>`):**
```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT COUNT(*) FROM cohort WHERE cohort_definition_id = '<COHORT_ID>';"
```
Expected: `0`

---

### Feature 9 — Federated ML Job Lifecycle

**Via SPA:** http://localhost:3000/jobs → **+ New Job** → fill in name, `fedavg_stub`, rounds → Create → Start.

**Via API — step by step:**

**Step 1 — create job:**
```cmd
curl -s -X POST http://localhost:8002/jobs -H "Content-Type: application/json" -d "{\"name\":\"test-fedavg-job\",\"algorithm\":\"fedavg_stub\",\"params\":{\"rounds\":2}}"
```
Copy the `"id"` value from the response as `<JOB_ID>`.

**Step 2 — start:**
```cmd
curl -X POST "http://localhost:8002/jobs/<JOB_ID>/start"
```
Expected: status = `RUNNING`

**Step 3 — submit edge result (node 1):**
```cmd
curl -X POST "http://localhost:8002/jobs/<JOB_ID>/result" -H "Content-Type: application/json" -d "{\"edge_node_id\":\"edge-node-1\",\"round\":1,\"payload\":{\"local_loss\":0.42,\"num_samples\":150,\"model_weights_stub\":{}}}"
```

**Step 4 — submit edge result (node 2):**
```cmd
curl -X POST "http://localhost:8002/jobs/<JOB_ID>/result" -H "Content-Type: application/json" -d "{\"edge_node_id\":\"edge-node-2\",\"round\":1,\"payload\":{\"local_loss\":0.35,\"num_samples\":200,\"model_weights_stub\":{}}}"
```

**Step 5 — aggregate:**
```cmd
curl -s "http://localhost:8002/jobs/<JOB_ID>/aggregate" | python -m json.tool
```
Expected: `global_loss=0.385`, `total_samples=350`, `num_nodes=2`, `status=DONE`

**DB check:**
```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT id, name, status, result_summary, started_at, finished_at FROM ml_jobs ORDER BY created_at DESC LIMIT 5;"
```

```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT edge_node_id, round, payload FROM job_edge_results WHERE job_id = '<JOB_ID>';"
```

**Conflict guard — try to start a DONE job:**
```cmd
curl -X POST "http://localhost:8002/jobs/<JOB_ID>/start"
```
Expected: 409 Conflict

---

### Feature 10 — Soft Delete Propagation

> **How it works:** The `orthancteam/orthanc` PostgreSQL plugin does **not** emit a
> `DeletedStudy` change event. The core-service poller runs a **reconciliation every ~30 s**:
> it compares the live Orthanc study list with the DB and soft-deletes any missing entries.
> Allow **~35 seconds** after deletion for `deleted_at` to be set.

**Step 1 — get IDs:**
```cmd
curl -s http://localhost:8001/studies | python -c "import sys,json; d=json.load(sys.stdin); print('orthanc_id:', d['items'][0]['orthanc_id']); print('study_uid: ', d['items'][0]['study_uid'])"
```
Copy both values as `<ORTHANC_STUDY_ID>` and `<STUDY_UID>`.

**Step 2 — delete from Orthanc:**
```cmd
curl -X DELETE "http://localhost:8042/studies/<ORTHANC_STUDY_ID>"
```

**Step 3 — wait the full 35 seconds, then check:**

> The reconciliation runs every ~30 s. If you check too early you will see `deleted_at: None`
> even though the study was deleted from Orthanc. Wait for the count to drop by 1.

```cmd
curl -s "http://localhost:8001/studies?include_deleted=true" | python -c "import sys,json; d=json.load(sys.stdin); [print(s['study_uid'], s['deleted_at']) for s in d['items']]"
```
The deleted study's `deleted_at` will change from `None` to a timestamp once reconciliation runs.

**Verify it is hidden from the default list:**
```cmd
curl -s http://localhost:8001/studies | python -c "import sys,json; print('total:', json.load(sys.stdin)['total'])"
```

**DB check:**
```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT study_uid, deleted_at FROM studies WHERE deleted_at IS NOT NULL;"
```

---

### Feature 11 — Monitoring (Prometheus & Grafana)

1. Open http://localhost:9090 → query `dcm_studies_ingested_total` → Execute
2. Query `dcm_poller_last_seq` and `dcm_poller_lag_seconds`
3. Open http://localhost:3001 → login admin/admin → Dashboards → Browse

**Metrics endpoints:**
```cmd
curl http://localhost:8001/metrics | findstr dcm_studies
curl http://localhost:8002/metrics | findstr dcm_cohort
```

---

## 5. Smoke Test Script

> **Requires Git Bash** (not CMD). Install via https://git-scm.com/download/win.

### Prepare a fresh DICOM file (run in Git Bash)

Each run needs a file with unique UIDs. Generate one:

```bash
python -c "
import pydicom, time
from pydicom.dataset import FileDataset
from pydicom.uid import generate_uid
import pydicom.uid

sop = generate_uid()
m = pydicom.dataset.FileMetaDataset()
m.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.1.1.2'
m.MediaStorageSOPInstanceUID = sop
m.TransferSyntaxUID = pydicom.uid.ExplicitVRLittleEndian

ds = FileDataset('test_smoke.dcm', {}, file_meta=m, preamble=b'\x00'*128)
ds.is_implicit_VR = False; ds.is_little_endian = True
ts = str(int(time.time()))
ds.PatientName = 'Smoke^' + ts; ds.PatientID = 'S' + ts
ds.PatientSex = 'M'; ds.StudyDate = '20260101'; ds.StudyTime = '120000'
ds.StudyInstanceUID = generate_uid(); ds.SeriesInstanceUID = generate_uid()
ds.SOPInstanceUID = sop; ds.SOPClassUID = m.MediaStorageSOPClassUID
ds.Modality = 'CT'; ds.InstitutionName = 'SmokeHospital'
ds.SeriesNumber = '1'; ds.InstanceNumber = '1'
ds.Rows = 8; ds.Columns = 8; ds.BitsAllocated = 8; ds.BitsStored = 8
ds.HighBit = 7; ds.PixelRepresentation = 0; ds.SamplesPerPixel = 1
ds.PhotometricInterpretation = 'MONOCHROME2'; ds.PixelData = bytes(64)
pydicom.dcmwrite('test_smoke.dcm', ds)
print('Created test_smoke.dcm')
"
```

### Run (Git Bash)

```bash
cd dcm-poc
POLL_WAIT=75 ./scripts/smoke_test.sh test_smoke.dcm
```

Expected output: `All smoke tests PASSED.`

> **Timing:** The script waits `POLL_WAIT` seconds twice (ingestion + soft-delete).
> At `POLL_WAIT=75` the full run takes ~3 minutes.

---

## 6. Postgres Direct Access

**Interactive session:**
```cmd
docker exec -it dcm-poc-postgres-1 psql -U dcm -d dcmdb
```

Inside psql:
```sql
\dt
SELECT * FROM studies LIMIT 5;
SELECT * FROM series LIMIT 5;
SELECT * FROM instances LIMIT 5;
SELECT * FROM cohort_definition;
SELECT * FROM cohort;
SELECT * FROM ml_jobs;
SELECT * FROM job_edge_results;
SELECT * FROM poller_state;
```

**One-liner from CMD (no interactive session):**
```cmd
docker exec dcm-poc-postgres-1 psql -U dcm -d dcmdb -c "SELECT * FROM studies LIMIT 5;"
```

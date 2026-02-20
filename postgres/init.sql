-- DCM PoC — PostgreSQL schema
-- Run automatically on first container start via docker-entrypoint-initdb.d

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Orthanc change poller state ─────────────────────────────────────────────
CREATE TABLE poller_state (
    id          SMALLINT PRIMARY KEY DEFAULT 1,
    last_seq    BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO poller_state (id, last_seq) VALUES (1, 0);

-- ─── DICOM Studies ────────────────────────────────────────────────────────────
CREATE TABLE studies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    study_uid           TEXT UNIQUE NOT NULL,   -- StudyInstanceUID  0020,000D
    orthanc_id          TEXT UNIQUE NOT NULL,   -- Orthanc internal resource ID
    patient_id          TEXT,                   -- PatientID          0010,0020
    patient_name        TEXT,                   -- PatientName        0010,0010
    patient_birth_date  DATE,                   -- PatientBirthDate   0010,0030
    patient_sex         CHAR(1),                -- PatientSex         0010,0040
    study_date          DATE,                   -- StudyDate          0008,0020
    study_time          TIME,                   -- StudyTime          0008,0030
    study_description   TEXT,                   -- StudyDescription   0008,1030
    accession_number    TEXT,                   -- AccessionNumber    0008,0050
    referring_physician TEXT,                   -- ReferringPhysicianName 0008,0090
    institution_name    TEXT,                   -- InstitutionName    0008,0080
    num_series          INT DEFAULT 0,
    num_instances       INT DEFAULT 0,
    -- Full Orthanc MainDicomTags response stored for flexible tag access
    raw_main_dicom_tags JSONB DEFAULT '{}',
    ingested_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ             -- soft delete
);

CREATE INDEX idx_studies_patient_id  ON studies (patient_id);
CREATE INDEX idx_studies_study_date  ON studies (study_date);
CREATE INDEX idx_studies_deleted_at  ON studies (deleted_at);
CREATE INDEX idx_studies_raw_tags    ON studies USING GIN (raw_main_dicom_tags);

-- ─── DICOM Series ─────────────────────────────────────────────────────────────
CREATE TABLE series (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    series_uid          TEXT UNIQUE NOT NULL,   -- SeriesInstanceUID  0020,000E
    orthanc_id          TEXT UNIQUE NOT NULL,
    study_id            UUID NOT NULL REFERENCES studies (id) ON DELETE CASCADE,
    modality            TEXT,                   -- Modality           0008,0060
    series_number       INT,                    -- SeriesNumber       0020,0011
    series_description  TEXT,                   -- SeriesDescription  0008,103E
    body_part_examined  TEXT,                   -- BodyPartExamined   0018,0015
    protocol_name       TEXT,                   -- ProtocolName       0018,1030
    num_instances       INT DEFAULT 0,
    raw_main_dicom_tags JSONB DEFAULT '{}',
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_series_study_id  ON series (study_id);
CREATE INDEX idx_series_modality  ON series (modality);

-- ─── DICOM Instances ──────────────────────────────────────────────────────────
CREATE TABLE instances (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sop_instance_uid    TEXT UNIQUE NOT NULL,   -- SOPInstanceUID     0008,0018
    orthanc_id          TEXT UNIQUE NOT NULL,
    series_id           UUID NOT NULL REFERENCES series (id) ON DELETE CASCADE,
    instance_number     INT,                    -- InstanceNumber     0020,0013
    sop_class_uid       TEXT,                   -- SOPClassUID        0008,0016
    transfer_syntax_uid TEXT,
    raw_main_dicom_tags JSONB DEFAULT '{}',
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_instances_series_id ON instances (series_id);

-- ─── Cohort Definitions (OMOP-inspired) ───────────────────────────────────────
-- cohort_definition: stores filter criteria and tag criteria used to build a cohort
CREATE TABLE cohort_definition (
    cohort_definition_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_definition_name  TEXT NOT NULL,
    cohort_description      TEXT,
    -- Structured filter criteria (date range, age, sex, institution, etc.)
    filters                 JSONB NOT NULL DEFAULT '{}',
    -- Orthanc DICOM tag criteria: [{tag, name, value}]
    -- These are used both to filter at resolve-time and written as Orthanc metadata
    orthanc_tags            JSONB NOT NULL DEFAULT '[]',
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Cohort Membership (OMOP-inspired) ────────────────────────────────────────
-- cohort: one row per study per cohort; subject_id = StudyInstanceUID
CREATE TABLE cohort (
    cohort_definition_id    UUID NOT NULL REFERENCES cohort_definition (cohort_definition_id) ON DELETE CASCADE,
    subject_id              TEXT NOT NULL,      -- DICOM StudyInstanceUID
    orthanc_study_id        TEXT NOT NULL,      -- Orthanc internal study ID (for label ops)
    cohort_start_date       DATE,               -- StudyDate of the subject study
    cohort_end_date         DATE,               -- NULL unless cohort window has a fixed end
    -- Snapshot of actual DICOM tag values at time of membership (for reproducibility)
    orthanc_tags_snapshot   JSONB NOT NULL DEFAULT '{}',
    added_at                TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (cohort_definition_id, subject_id)
);

CREATE INDEX idx_cohort_subject_id ON cohort (subject_id);

-- ─── Federated ML Jobs ────────────────────────────────────────────────────────
CREATE TABLE ml_jobs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_definition_id    UUID REFERENCES cohort_definition (cohort_definition_id),
    name                    TEXT NOT NULL,
    algorithm               TEXT NOT NULL,      -- e.g. "fedavg_classification"
    params                  JSONB NOT NULL DEFAULT '{}',
    status                  TEXT NOT NULL DEFAULT 'PENDING',
                            -- PENDING | RUNNING | AGGREGATING | DONE | FAILED
    result_summary          JSONB,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    started_at              TIMESTAMPTZ,
    finished_at             TIMESTAMPTZ
);

CREATE INDEX idx_ml_jobs_status ON ml_jobs (status);

-- ─── Federated Edge Node Results ──────────────────────────────────────────────
CREATE TABLE job_edge_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL REFERENCES ml_jobs (id) ON DELETE CASCADE,
    edge_node_id    TEXT NOT NULL,
    round           INT NOT NULL DEFAULT 1,
    payload         JSONB NOT NULL,     -- model weight stubs + local_loss + num_samples
    received_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_edge_results_job_id ON job_edge_results (job_id);

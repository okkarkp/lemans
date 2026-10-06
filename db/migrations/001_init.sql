-- LeMans 2.0 initial schema.
-- Operational tables hold current state; ledger_entry is the append-only, hash-chained
-- record of every state change and is the evidence base for billing.

CREATE TABLE personnel (
  id            text PRIMARY KEY,
  display_name  text NOT NULL,
  role_title    text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id            text PRIMARY KEY,
  display_name  text NOT NULL,
  role          text NOT NULL CHECK (role IN ('PERSONNEL', 'SUPERVISOR', 'PMO')),
  personnel_id  text REFERENCES personnel (id),
  CONSTRAINT app_user_personnel_role_chk CHECK ((role = 'PERSONNEL') = (personnel_id IS NOT NULL))
);

CREATE TABLE public_holiday (
  holiday_date  date PRIMARY KEY,
  name          text NOT NULL
);

CREATE TABLE attendance (
  id                 bigserial PRIMARY KEY,
  personnel_id       text NOT NULL REFERENCES personnel (id),
  work_date          date NOT NULL,
  location           text NOT NULL CHECK (location IN ('OFFICE', 'WFH')),
  evidence_device    text NOT NULL,
  evidence_network   text NOT NULL,
  evidence_strength  text NOT NULL CHECK (evidence_strength IN ('STRONG', 'MEDIUM')),
  checked_in_at      timestamptz NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_one_per_day UNIQUE (personnel_id, work_date)
);

CREATE TABLE leave_request (
  id                   bigserial PRIMARY KEY,
  personnel_id         text NOT NULL REFERENCES personnel (id),
  leave_type           text NOT NULL CHECK (leave_type IN ('ANNUAL', 'MEDICAL', 'CHILDCARE', 'OTHER')),
  start_date           date NOT NULL,
  end_date             date NOT NULL,
  backup_personnel_id  text NOT NULL REFERENCES personnel (id),
  status               text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  submitted_at         timestamptz NOT NULL,
  decided_at           timestamptz,
  decided_by           text REFERENCES app_user (id),
  decision_note        text,
  CONSTRAINT leave_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT leave_backup_not_self_chk CHECK (backup_personnel_id <> personnel_id)
);
CREATE INDEX leave_request_personnel_dates_idx ON leave_request (personnel_id, start_date, end_date);
CREATE INDEX leave_request_status_idx ON leave_request (status);

CREATE TABLE day_correction (
  id            bigserial PRIMARY KEY,
  personnel_id  text NOT NULL REFERENCES personnel (id),
  work_date     date NOT NULL,
  outcome       text NOT NULL CHECK (outcome IN ('LEAVE', 'WORKED')),
  reason        text NOT NULL CHECK (length(trim(reason)) >= 5),
  recorded_by   text NOT NULL REFERENCES app_user (id),
  recorded_at   timestamptz NOT NULL,
  CONSTRAINT day_correction_one_per_day UNIQUE (personnel_id, work_date)
);

CREATE TABLE follow_up (
  id            bigserial PRIMARY KEY,
  personnel_id  text NOT NULL REFERENCES personnel (id),
  work_date     date NOT NULL,
  recorded_by   text NOT NULL REFERENCES app_user (id),
  recorded_at   timestamptz NOT NULL,
  CONSTRAINT follow_up_one_per_day UNIQUE (personnel_id, work_date)
);

CREATE TABLE monthly_report (
  report_month   char(7) PRIMARY KEY CHECK (report_month ~ '^[0-9]{4}-[0-9]{2}$'),
  billable_days  integer NOT NULL,
  capacity_days  integer NOT NULL,
  snapshot       jsonb NOT NULL,
  accepted_by    text NOT NULL REFERENCES app_user (id),
  accepted_at    timestamptz NOT NULL,
  ledger_seq     bigint NOT NULL
);

CREATE TABLE ledger_entry (
  seq          bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  prev_hash    char(64) NOT NULL,
  hash         char(64) NOT NULL UNIQUE
);
CREATE INDEX ledger_entry_event_type_idx ON ledger_entry (event_type);

CREATE TABLE app_setting (
  key    text PRIMARY KEY,
  value  text NOT NULL
);

-- Evidence tables are immutable once written. Corrections are new rows, never edits.
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not permitted: records are append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER attendance_immutable BEFORE UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER monthly_report_immutable BEFORE UPDATE OR DELETE ON monthly_report
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER day_correction_immutable BEFORE UPDATE OR DELETE ON day_correction
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

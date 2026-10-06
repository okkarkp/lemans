-- Leave entitlements and balances, half-day leave, withdrawal and cancellation, and supporting
-- documents (for example a medical certificate).

CREATE TABLE leave_entitlement (
  personnel_id  text NOT NULL REFERENCES personnel (id),
  year          integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  leave_type    text NOT NULL CHECK (leave_type IN ('ANNUAL', 'MEDICAL', 'CHILDCARE')),
  days          numeric(4, 1) NOT NULL CHECK (days >= 0 AND days <= 365),
  set_by        text NOT NULL REFERENCES app_user (id),
  set_at        timestamptz NOT NULL,
  PRIMARY KEY (personnel_id, year, leave_type)
);

ALTER TABLE leave_request DROP CONSTRAINT leave_request_status_check;
ALTER TABLE leave_request ADD CONSTRAINT leave_request_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'));
ALTER TABLE leave_request ADD COLUMN half_day text CHECK (half_day IN ('AM', 'PM'));
ALTER TABLE leave_request ADD CONSTRAINT leave_half_day_single_chk CHECK (half_day IS NULL OR start_date = end_date);
ALTER TABLE leave_request ADD COLUMN cancelled_at timestamptz;

-- Working days the request consumes from the balance (0.5 for a half day). Backfilled for
-- existing rows by counting weekdays that are not public holidays.
ALTER TABLE leave_request ADD COLUMN days numeric(4, 1);
UPDATE leave_request l SET days = (
  SELECT count(*) FROM generate_series(l.start_date, l.end_date, interval '1 day') g(d)
  WHERE extract(isodow FROM g.d) < 6 AND NOT EXISTS (SELECT 1 FROM public_holiday h WHERE h.holiday_date = g.d::date)
) WHERE days IS NULL;
ALTER TABLE leave_request ALTER COLUMN days SET NOT NULL;
ALTER TABLE leave_request ADD CONSTRAINT leave_days_chk CHECK (days > 0);

CREATE TABLE leave_attachment (
  id                bigserial PRIMARY KEY,
  leave_request_id  bigint NOT NULL REFERENCES leave_request (id),
  file_name         text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 120),
  content_type      text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes        integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256            char(64) NOT NULL,
  content           bytea NOT NULL,
  uploaded_by       text NOT NULL REFERENCES app_user (id),
  uploaded_at       timestamptz NOT NULL
);
CREATE INDEX leave_attachment_request_idx ON leave_attachment (leave_request_id);
CREATE TRIGGER leave_attachment_immutable BEFORE UPDATE OR DELETE ON leave_attachment
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

GRANT SELECT, INSERT, UPDATE ON leave_entitlement TO lemans_app_rw;
GRANT SELECT, INSERT ON leave_attachment TO lemans_app_rw;
GRANT USAGE ON SEQUENCE leave_attachment_id_seq TO lemans_app_rw;

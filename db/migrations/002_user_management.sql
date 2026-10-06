-- User management: an ADMIN role, account activation, and assignment periods for personnel.
-- Accounts are deactivated, never deleted, so historical evidence stays attributable.

ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('PERSONNEL', 'SUPERVISOR', 'PMO', 'ADMIN'));
ALTER TABLE app_user ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE app_user ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE app_user ADD CONSTRAINT app_user_id_format_chk CHECK (id ~ '^[a-z0-9][a-z0-9._-]{2,63}$');

-- Assignment period: days outside it are neither billable capacity nor counted for coverage.
ALTER TABLE personnel ADD COLUMN start_date date;
UPDATE personnel SET start_date = '2026-01-01' WHERE start_date IS NULL;
ALTER TABLE personnel ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE personnel ADD COLUMN end_date date;
ALTER TABLE personnel ADD CONSTRAINT personnel_period_chk CHECK (end_date IS NULL OR end_date >= start_date);
CREATE INDEX personnel_period_idx ON personnel (start_date, end_date);

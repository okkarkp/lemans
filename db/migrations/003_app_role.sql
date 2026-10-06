-- Least privilege for the running application. The app connects as a login role that is a
-- member of lemans_app_rw; migrations and seeding run as the schema owner.
-- The app role cannot DELETE or TRUNCATE anything, and - because it does not own the tables -
-- cannot ALTER TABLE ... DISABLE TRIGGER to get round the append-only guards.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lemans_app_rw') THEN
    CREATE ROLE lemans_app_rw NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM lemans_app_rw;
GRANT USAGE ON SCHEMA public TO lemans_app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lemans_app_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO lemans_app_rw;

-- Evidence: insert only.
GRANT INSERT ON ledger_entry, attendance, day_correction, monthly_report, follow_up TO lemans_app_rw;
-- Workflow and reference data: insert and update, never delete.
GRANT INSERT, UPDATE ON leave_request, personnel, app_user, app_setting TO lemans_app_rw;

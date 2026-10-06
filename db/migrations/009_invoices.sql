-- The hand-off to billing: once IRAS accepts a month, the PMO records the invoice raised for it.
CREATE TABLE invoice_record (
  report_month  char(7) PRIMARY KEY REFERENCES monthly_report (report_month),
  invoice_ref   text NOT NULL CHECK (invoice_ref ~ '^[A-Za-z0-9/_.-]{3,40}$'),
  raised_by     text NOT NULL REFERENCES app_user (id),
  raised_at     timestamptz NOT NULL,
  ledger_seq    bigint NOT NULL
);
CREATE TRIGGER invoice_record_immutable BEFORE UPDATE OR DELETE ON invoice_record
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
GRANT SELECT, INSERT ON invoice_record TO lemans_app_rw;

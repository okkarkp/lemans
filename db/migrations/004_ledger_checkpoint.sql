-- Verified points in the ledger chain. Routine checks recompute only from the latest checkpoint;
-- a full verification from genesis runs nightly and on demand.
CREATE TABLE ledger_checkpoint (
  id           bigserial PRIMARY KEY,
  seq          bigint NOT NULL REFERENCES ledger_entry (seq),
  hash         char(64) NOT NULL,
  full_verify  boolean NOT NULL,
  verified_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_checkpoint_seq_idx ON ledger_checkpoint (seq DESC);

CREATE TRIGGER ledger_checkpoint_immutable BEFORE UPDATE OR DELETE ON ledger_checkpoint
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

GRANT SELECT, INSERT ON ledger_checkpoint TO lemans_app_rw;
GRANT USAGE ON SEQUENCE ledger_checkpoint_id_seq TO lemans_app_rw;

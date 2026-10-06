-- Teams route approvals to the right IRAS supervisor; delegation covers a supervisor's absence.
-- SLA coverage stays contract-wide; teams only decide who approves.

CREATE TABLE team (
  id             text PRIMARY KEY CHECK (id ~ '^[A-Z0-9-]{2,20}$'),
  name           text NOT NULL UNIQUE,
  supervisor_id  text REFERENCES app_user (id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Existing personnel join one default team, supervised by the first active supervisor (if any).
INSERT INTO team (id, name, supervisor_id)
SELECT 'TEAM-1', 'Default team',
       (SELECT id FROM app_user WHERE role = 'SUPERVISOR' AND active ORDER BY id LIMIT 1)
WHERE EXISTS (SELECT 1 FROM personnel);

ALTER TABLE personnel ADD COLUMN team_id text REFERENCES team (id);
UPDATE personnel SET team_id = 'TEAM-1' WHERE team_id IS NULL;
ALTER TABLE personnel ALTER COLUMN team_id SET NOT NULL;
CREATE INDEX personnel_team_idx ON personnel (team_id);

CREATE TABLE delegation (
  id            bigserial PRIMARY KEY,
  delegator_id  text NOT NULL REFERENCES app_user (id),
  delegate_id   text NOT NULL REFERENCES app_user (id),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  created_by    text NOT NULL REFERENCES app_user (id),
  created_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  revoked_by    text REFERENCES app_user (id),
  CONSTRAINT delegation_period_chk CHECK (end_date >= start_date),
  CONSTRAINT delegation_not_self_chk CHECK (delegator_id <> delegate_id)
);
CREATE INDEX delegation_active_idx ON delegation (delegator_id, start_date, end_date) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON team, delegation TO lemans_app_rw;
GRANT USAGE ON SEQUENCE delegation_id_seq TO lemans_app_rw;

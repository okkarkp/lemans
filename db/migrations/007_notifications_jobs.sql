-- In-app notifications, an email outbox written in the same transaction as the event (so a
-- notification is never lost or sent for an event that rolled back), and idempotent job runs.

ALTER TABLE app_user ADD COLUMN email text CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

CREATE TABLE notification (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL REFERENCES app_user (id),
  kind        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  link        text CHECK (link IS NULL OR link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  created_at  timestamptz NOT NULL,
  read_at     timestamptz
);
CREATE INDEX notification_user_unread_idx ON notification (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notification_user_idx ON notification (user_id, created_at DESC);

CREATE TABLE email_outbox (
  id             bigserial PRIMARY KEY,
  notification_id bigint REFERENCES notification (id),
  to_address     text NOT NULL,
  subject        text NOT NULL,
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'LOGGED')),
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz
);
CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at) WHERE status = 'PENDING';

CREATE TABLE job_run (
  job      text NOT NULL,
  run_key  text NOT NULL,
  ran_at   timestamptz NOT NULL DEFAULT now(),
  result   jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (job, run_key)
);

GRANT SELECT, INSERT, UPDATE ON notification, email_outbox TO lemans_app_rw;
GRANT SELECT, INSERT ON job_run TO lemans_app_rw;
GRANT USAGE ON SEQUENCE notification_id_seq, email_outbox_id_seq TO lemans_app_rw;

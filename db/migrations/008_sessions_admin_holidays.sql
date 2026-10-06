-- Server-side sessions (idle timeout, revocation), second-administrator approval for admin rights,
-- and maintained public holidays.

CREATE TABLE user_session (
  id              uuid PRIMARY KEY,
  user_id         text NOT NULL REFERENCES app_user (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  revoked_reason  text
);
CREATE INDEX user_session_user_idx ON user_session (user_id) WHERE revoked_at IS NULL;

-- Granting administrator rights needs a second administrator. A new administrator account stays
-- inactive, and a promotion stays at the old role, until approved.
CREATE TABLE admin_grant (
  id              bigserial PRIMARY KEY,
  target_user_id  text NOT NULL REFERENCES app_user (id),
  from_role       text,
  requested_by    text NOT NULL REFERENCES app_user (id),
  requested_at    timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by      text REFERENCES app_user (id),
  decided_at      timestamptz,
  CONSTRAINT admin_grant_four_eyes_chk CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
CREATE UNIQUE INDEX admin_grant_one_pending_idx ON admin_grant (target_user_id) WHERE status = 'PENDING';

ALTER TABLE public_holiday ADD COLUMN added_by text REFERENCES app_user (id);
ALTER TABLE public_holiday ADD COLUMN added_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE ON user_session, admin_grant TO lemans_app_rw;
GRANT USAGE ON SEQUENCE admin_grant_id_seq TO lemans_app_rw;
-- Holidays are reference data, not evidence: they may be removed (only future, open dates - enforced in the app).
GRANT SELECT, INSERT, DELETE ON public_holiday TO lemans_app_rw;

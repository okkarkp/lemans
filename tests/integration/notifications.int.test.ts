import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { decideLeave, submitLeave } from "@/server/services/leave";
import { createDelegation } from "@/server/services/teams";
import { dispatchEmails, type MailTransport } from "@/server/services/email";
import { runDueJobs } from "@/server/services/jobs";
import { listNotifications, markRead, unreadCount } from "@/server/services/notify";
import { reseed } from "../support/test-db";
import { personnel, race, setClock, supervisor } from "../support/fixtures";

const kinds = async (userId: string) => (await listNotifications(userId)).map((n) => n.kind);
const req = (o: Record<string, unknown> = {}) => ({ leaveType: "ANNUAL" as const, startDate: "2026-09-28", endDate: "2026-09-28", backupPersonnelId: "SP04", ...o });

describe("notifications", () => {
  beforeEach(() => reseed());

  it("routes a new request to the team's approvers (and delegates), and the decision back to the requester", async () => {
    await createDelegation(supervisor, { delegateId: "u-sup02", startDate: "2026-09-22", endDate: "2026-09-25" });
    const { id } = await submitLeave(personnel(1), req({ leaveType: "MEDICAL" }));
    expect(await kinds("u-sup01")).toContain("LEAVE_SUBMITTED");
    expect(await kinds("u-sup02")).toEqual(expect.arrayContaining(["LEAVE_SUBMITTED", "DELEGATION_CREATED"]));
    const msg = (await listNotifications("u-sup01")).find((n) => n.kind === "LEAVE_SUBMITTED")!;
    expect(msg.body.toLowerCase()).not.toContain("medical");

    await decideLeave(supervisor, id, { decision: "REJECT", note: "Clashes with release" });
    expect((await listNotifications("u-sp01"))[0]).toMatchObject({ kind: "LEAVE_REJECTED", link: "/me" });
  });

  it("only marks the user's own notifications as read", async () => {
    await submitLeave(personnel(1), req());
    const theirs = (await listNotifications("u-sup01"))[0].id;
    expect(await markRead("u-sp01", [theirs])).toBe(0);
    expect(await unreadCount("u-sup01")).toBeGreaterThan(0);
    expect(await markRead("u-sup01", "all")).toBeGreaterThan(0);
    expect(await unreadCount("u-sup01")).toBe(0);
  });
});

describe("scheduled jobs", () => {
  beforeEach(() => reseed());

  it("reminds people who have not checked in at 11:00, once", async () => {
    await setClock("2026-09-22T10:59");
    expect((await runDueJobs()).ran.map((j) => j.job)).not.toContain("checkin-reminder");
    await setClock("2026-09-22T11:00");
    const r = await runDueJobs();
    expect(r.ran.find((j) => j.job === "checkin-reminder")?.result).toEqual({ reminded: 2 });
    expect(await kinds("u-sp03")).toContain("CHECKIN_REMINDER");
    expect(await kinds("u-sp01")).not.toContain("CHECKIN_REMINDER");
    expect((await runDueJobs()).ran).toEqual([]);
  });

  it("alerts the person and the PMO after the alert time, exactly once even if two runners race", async () => {
    await setClock("2026-09-22T12:30");
    const [a, b] = (await race([() => runDueJobs(), () => runDueJobs()])).ok;
    const alerts = [...a.ran, ...b.ran].filter((j) => j.job === "missing-checkin-alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].result).toEqual({ missing: 2 });
    expect((await kinds("u-pmo01")).filter((k) => k === "MISSING_CHECKIN_SUMMARY")).toHaveLength(1);
    expect(await kinds("u-sp06")).toContain("MISSING_CHECKIN");
  });

  it("reminds approvers about requests waiting too long, and announces the month-end report", async () => {
    await setClock("2026-09-24T09:30");
    await runDueJobs();
    expect(await kinds("u-sup01")).toContain("APPROVAL_REMINDER");
    expect(await kinds("u-sup02")).not.toContain("APPROVAL_REMINDER");
    await setClock("2026-10-01T09:00");
    const r = await runDueJobs();
    expect(r.ran.find((j) => j.job === "month-end-report")?.key).toBe("2026-09");
    expect(await kinds("u-pmo01")).toContain("REPORT_READY");
  });
});

describe("email outbox", () => {
  beforeEach(() => reseed());

  it("queues email for people with an address, and sends, retries or gives up", async () => {
    await pool().query("UPDATE app_user SET email = 'sup01@lemans.invalid' WHERE id = 'u-sup01'");
    await submitLeave(personnel(1), req());
    const row = async () => (await pool().query("SELECT status, attempts, to_address, last_error FROM email_outbox")).rows[0];
    expect(await row()).toMatchObject({ status: "PENDING", to_address: "sup01@lemans.invalid" });

    const failing: MailTransport = { send: async () => { throw new Error("connection refused"); } };
    expect(await dispatchEmails(failing)).toMatchObject({ retrying: 1 });
    expect(await row()).toMatchObject({ status: "PENDING", attempts: 1, last_error: "connection refused" });
    await pool().query("UPDATE email_outbox SET next_attempt_at = now()");

    const sent: string[] = [];
    expect(await dispatchEmails({ send: async (m) => { sent.push(m.subject); } })).toMatchObject({ sent: 1 });
    expect(sent).toEqual(["LeMans: Leave request waiting for approval"]);
    expect((await row()).status).toBe("SENT");

    await submitLeave(personnel(2), req({ startDate: "2026-09-23", endDate: "2026-09-23", backupPersonnelId: "SP04" }));
    for (let i = 0; i < 5; i++) { await pool().query("UPDATE email_outbox SET next_attempt_at = now() WHERE status = 'PENDING'"); await dispatchEmails(failing); }
    expect((await pool().query("SELECT status FROM email_outbox ORDER BY id DESC LIMIT 1")).rows[0].status).toBe("FAILED");
  });

  it("in log mode marks messages as logged without sending", async () => {
    await pool().query("UPDATE app_user SET email = 'sup01@lemans.invalid' WHERE id = 'u-sup01'");
    await submitLeave(personnel(1), req());
    expect(await dispatchEmails(null)).toMatchObject({ logged: 1 });
  });
});

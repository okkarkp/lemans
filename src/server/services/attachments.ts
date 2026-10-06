import "server-only";
import { createHash } from "node:crypto";
import { pool, withTx } from "../db";
import { now } from "../clock";
import { appendLedger } from "../ledger";
import { badRequest, conflict, notFound } from "../errors";
import type { CurrentUser } from "../auth/session";
import { approvableTeams } from "./teams";
import { safeFileName, sniffType } from "../domain/files";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_PER_REQUEST = 5;

/** Supporting documents are medical data: only the requester and those who may decide the request can see them. */
async function canSee(user: CurrentUser, req: { personnel_id: string; team_id: string }, day: string) {
  if (user.personnelId && user.personnelId === req.personnel_id) return true;
  return (await approvableTeams(pool(), user, day)).has(req.team_id);
}

export async function addAttachment(user: CurrentUser, requestId: number, file: { name: string; bytes: Uint8Array }) {
  if (file.bytes.byteLength === 0) throw badRequest("EMPTY_FILE", "The file is empty.");
  if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw badRequest("TOO_LARGE", "Files can be at most 5 MB.");
  const type = sniffType(file.bytes);
  if (!type) throw badRequest("BAD_TYPE", "Upload a PDF, JPEG or PNG file.");
  return withTx(async (tx) => {
    const n = await now(tx);
    const req = (await tx.query("SELECT personnel_id, status FROM leave_request WHERE id = $1 FOR UPDATE", [requestId])).rows[0];
    if (!req || req.personnel_id !== user.personnelId) throw notFound("Leave request");
    if (!["PENDING", "APPROVED"].includes(req.status)) throw conflict("WRONG_STATUS", "Documents can only be added to pending or approved requests.");
    const count = (await tx.query("SELECT count(*)::int AS n FROM leave_attachment WHERE leave_request_id = $1", [requestId])).rows[0].n;
    if (count >= MAX_PER_REQUEST) throw conflict("TOO_MANY", `At most ${MAX_PER_REQUEST} documents per request.`);
    const sha256 = createHash("sha256").update(file.bytes).digest("hex");
    const r = await tx.query<{ id: string }>(
      `INSERT INTO leave_attachment (leave_request_id, file_name, content_type, size_bytes, sha256, content, uploaded_by, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [requestId, safeFileName(file.name), type, file.bytes.byteLength, sha256, Buffer.from(file.bytes), user.id, n.instant]);
    const id = Number(r.rows[0].id);
    // The ledger records the document's fingerprint, never its content or name.
    await appendLedger(tx, { actorId: user.id, eventType: "ATTACHMENT_ADDED", occurredAt: n.instant, payload: { requestId, attachmentId: id, sha256, sizeBytes: file.bytes.byteLength } });
    return { id };
  });
}

export interface AttachmentMeta { id: number; fileName: string; contentType: string; sizeBytes: number; uploadedAt: string }

export async function listAttachments(user: CurrentUser, requestId: number): Promise<AttachmentMeta[]> {
  const db = pool();
  const req = (await db.query("SELECT l.personnel_id, p.team_id FROM leave_request l JOIN personnel p ON p.id = l.personnel_id WHERE l.id = $1", [requestId])).rows[0];
  if (!req || !(await canSee(user, req, (await now(db)).date))) throw notFound("Leave request");
  const r = await db.query("SELECT id, file_name, content_type, size_bytes, uploaded_at FROM leave_attachment WHERE leave_request_id = $1 ORDER BY id", [requestId]);
  return r.rows.map((a) => ({ id: Number(a.id), fileName: a.file_name, contentType: a.content_type, sizeBytes: a.size_bytes, uploadedAt: (a.uploaded_at as Date).toISOString() }));
}

export async function getAttachment(user: CurrentUser, requestId: number, attachmentId: number) {
  const db = pool();
  const r = (await db.query(
    `SELECT a.file_name, a.content_type, a.content, l.personnel_id, p.team_id FROM leave_attachment a
     JOIN leave_request l ON l.id = a.leave_request_id JOIN personnel p ON p.id = l.personnel_id
     WHERE a.id = $1 AND a.leave_request_id = $2`, [attachmentId, requestId])).rows[0];
  if (!r || !(await canSee(user, r, (await now(db)).date))) throw notFound("Document");
  return { fileName: r.file_name as string, contentType: r.content_type as string, content: r.content as Buffer };
}

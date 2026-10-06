import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http/handler";
import { addAttachment, listAttachments, MAX_ATTACHMENT_BYTES } from "@/server/services/attachments";

const parseId = async (ctx: RouteContext<"/api/leave/[id]/attachments">) => {
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("BAD_ID", "Invalid request id.");
  return id;
};

export const GET = route<RouteContext<"/api/leave/[id]/attachments">>(async (_req, ctx) => {
  const user = await authorise(["PERSONNEL", "SUPERVISOR"]);
  return NextResponse.json(await listAttachments(user, await parseId(ctx)));
});

export const POST = route<RouteContext<"/api/leave/[id]/attachments">>(async (req, ctx) => {
  const user = await authorise(["PERSONNEL"]);
  const id = await parseId(ctx);
  // Refuse oversize bodies before buffering them.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_ATTACHMENT_BYTES + 64 * 1024) throw badRequest("TOO_LARGE", "Files can be at most 5 MB.");
  let form: FormData;
  try { form = await req.formData(); } catch { throw badRequest("BAD_FORM", "Send the file as multipart form data."); }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("NO_FILE", "Choose a file to upload.");
  return NextResponse.json(await addAttachment(user, id, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }), { status: 201 });
});

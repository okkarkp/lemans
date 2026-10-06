import { authorise } from "@/server/auth/session";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http/handler";
import { getAttachment } from "@/server/services/attachments";

export const GET = route<RouteContext<"/api/leave/[id]/attachments/[aid]">>(async (_req, ctx) => {
  const user = await authorise(["PERSONNEL", "SUPERVISOR"]);
  const p = await ctx.params;
  const id = Number(p.id), aid = Number(p.aid);
  if (![id, aid].every((x) => Number.isSafeInteger(x) && x > 0)) throw badRequest("BAD_ID", "Invalid id.");
  const doc = await getAttachment(user, id, aid);
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "content-type": doc.contentType,
      // Always a download, never rendered in the app's origin.
      "content-disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
      "content-security-policy": "sandbox; default-src 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});

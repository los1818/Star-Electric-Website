import { canAny } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { storage } from "@/server/storage";
import { findVisibleWorkOrder } from "@/server/work-orders";

/**
 * Serves an attachment's bytes after checking the viewer may see the record it belongs to.
 * Anything they can't see is a plain 404, so IDs don't leak what exists.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!canAny(user.role, ["workorders:read_all", "workorders:read_assigned"])) return notFound();

  const { id } = await params;
  const att = await db.attachment.findUnique({ where: { id } });
  if (!att) return notFound();
  if (att.entityType !== "WorkOrder" || !(await findVisibleWorkOrder(user, att.entityId, {}))) return notFound();

  const bytes = await storage.get(att.storageKey);
  if (!bytes) return notFound();
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": att.contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${att.fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}

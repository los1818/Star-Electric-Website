"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/server";
import { MAX_PHOTOS_PER_UPLOAD, MAX_PHOTO_BYTES, MAX_SIGNATURE_BYTES, cleanFileName, decodePngDataUrl, extensionFor, sniffImageType } from "@/lib/files";
import { optionalText, requiredId, requiredText } from "@/lib/validation";
import { audit } from "@/server/audit";
import { storage } from "@/server/storage";
import { findVisibleWorkOrder } from "@/server/work-orders";
import { ActionError, ValidationError, authorizedFormAction } from "./authorized-action";

/** The work order, if this user can see it and add to it. Technicians can't add to closed work orders. */
async function workOrderForUpload(user: CurrentUser, workOrderId: string) {
  const wo = await findVisibleWorkOrder(user, workOrderId, { status: true });
  if (!wo) throw new ActionError("That work order doesn't exist or isn't assigned to you.");
  if (wo.status.isClosed && !can(user.role, "workorders:write")) throw new ActionError(`${wo.number} is ${wo.status.label.toLowerCase()}, so it can't be changed.`);
  return wo;
}

export const uploadWorkOrderPhotos = authorizedFormAction(
  "workorders:add_notes",
  z.object({ workOrderId: requiredId("Work order"), caption: optionalText(300) }),
  async ({ workOrderId, caption }, user, formData) => {
    const wo = await workOrderForUpload(user, workOrderId);
    const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new ValidationError({ photos: "Choose at least one photo" });
    if (files.length > MAX_PHOTOS_PER_UPLOAD) throw new ValidationError({ photos: `Upload at most ${MAX_PHOTOS_PER_UPLOAD} photos at a time` });

    // Check every file before storing any, so a bad one doesn't leave half an upload.
    const checked = await Promise.all(
      files.map(async (file) => {
        if (file.size > MAX_PHOTO_BYTES) throw new ValidationError({ photos: `${cleanFileName(file.name, "A photo")} is over 15 MB` });
        const bytes = new Uint8Array(await file.arrayBuffer());
        const type = sniffImageType(bytes);
        if (!type) throw new ValidationError({ photos: `${cleanFileName(file.name, "That file")} isn't a photo (JPEG, PNG, WebP or HEIC)` });
        return { bytes, type, name: cleanFileName(file.name, `photo.${extensionFor(type)}`) };
      }),
    );

    const stored: string[] = [];
    try {
      for (const f of checked) {
        const key = `work-orders/${wo.id}/${randomUUID()}.${extensionFor(f.type)}`;
        await storage.put(key, f.bytes);
        stored.push(key);
      }
      await db.$transaction(async (tx) => {
        await tx.attachment.createMany({
          data: checked.map((f, i) => ({ entityType: "WorkOrder", entityId: wo.id, kind: "PHOTO", caption, fileName: f.name, contentType: f.type, sizeBytes: f.bytes.length, storageKey: stored[i], uploadedById: user.id })),
        });
        await audit(tx, user.id, "add_photos", "WorkOrder", wo.id, { count: checked.length, caption });
      });
    } catch (error) {
      await Promise.all(stored.map((key) => storage.delete(key)));
      throw error;
    }
    revalidatePath(`/work-orders/${wo.id}`);
    return { message: checked.length === 1 ? "Photo added." : `${checked.length} photos added.` };
  },
);

export const saveWorkOrderSignature = authorizedFormAction(
  "workorders:add_notes",
  z.object({ workOrderId: requiredId("Work order"), signerName: requiredText("Signed by", 120), signature: z.string({ error: "Sign in the box first" }).min(1, "Sign in the box first") }),
  async ({ workOrderId, signerName, signature }, user) => {
    const wo = await workOrderForUpload(user, workOrderId);
    const bytes = decodePngDataUrl(signature);
    if (!bytes) throw new ValidationError({ signature: "Sign in the box first" });
    if (bytes.length > MAX_SIGNATURE_BYTES) throw new ValidationError({ signature: "That signature is too large. Clear it and sign again." });

    const key = `work-orders/${wo.id}/${randomUUID()}.png`;
    await storage.put(key, bytes);
    try {
      await db.$transaction(async (tx) => {
        await tx.attachment.create({
          data: { entityType: "WorkOrder", entityId: wo.id, kind: "SIGNATURE", signerName, fileName: `signature-${wo.number}.png`, contentType: "image/png", sizeBytes: bytes.length, storageKey: key, uploadedById: user.id },
        });
        await audit(tx, user.id, "add_signature", "WorkOrder", wo.id, { signerName });
      });
    } catch (error) {
      await storage.delete(key);
      throw error;
    }
    revalidatePath(`/work-orders/${wo.id}`);
    return { message: `Signature from ${signerName} saved.` };
  },
);

/** Office can remove any photo; technicians only photos they added, on open work orders. Signatures: office only. */
export const deleteAttachment = authorizedFormAction("workorders:add_notes", z.object({ id: requiredId("Attachment") }), async ({ id }, user) => {
  const att = await db.attachment.findUnique({ where: { id } });
  if (!att || att.entityType !== "WorkOrder") throw new ActionError("That file no longer exists.");
  const wo = await workOrderForUpload(user, att.entityId);
  const office = can(user.role, "workorders:write");
  if (!office && (att.kind === "SIGNATURE" || att.uploadedById !== user.id)) {
    throw new ActionError(att.kind === "SIGNATURE" ? "Only the office can remove a signature." : "You can only remove photos you added.");
  }
  await db.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id } });
    await audit(tx, user.id, "delete", "Attachment", id, { workOrderId: wo.id, kind: att.kind, fileName: att.fileName, signerName: att.signerName });
  });
  await storage.delete(att.storageKey);
  revalidatePath(`/work-orders/${wo.id}`);
  return { message: att.kind === "SIGNATURE" ? "Signature removed." : "Photo removed." };
});

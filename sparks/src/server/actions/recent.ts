"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizedAction } from "./authorized-action";

export const clearRecentItems = authorizedAction("authenticated", z.object({}), async (_input, user) => {
  await db.recentItem.deleteMany({ where: { userId: user.id } });
  revalidatePath("/", "layout");
});

import "server-only";
import { db } from "@/lib/db";

export const RECENT_ITEMS_LIMIT = 10;

export interface RecentItemInput {
  entityType: string;
  entityId: string;
  label: string;
  href: string;
}

/** Record that a user opened a record; keeps only their most recent N. */
export async function recordRecentItem(userId: string, item: RecentItemInput): Promise<void> {
  await db.recentItem.upsert({
    where: { userId_entityType_entityId: { userId, entityType: item.entityType, entityId: item.entityId } },
    create: { userId, ...item },
    update: { label: item.label, href: item.href, viewedAt: new Date() },
  });
  const stale = await db.recentItem.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    skip: RECENT_ITEMS_LIMIT,
    select: { id: true },
  });
  if (stale.length > 0) await db.recentItem.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
}

export async function listRecentItems(userId: string) {
  return db.recentItem.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    take: RECENT_ITEMS_LIMIT,
  });
}

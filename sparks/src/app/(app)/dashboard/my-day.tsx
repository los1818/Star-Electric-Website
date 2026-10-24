import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/server";
import { formatHours } from "@/lib/money";
import { formatDateTime, formatTime, reginaDayRange, TIME_ZONE } from "@/lib/time";

const mapLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** A technician's home screen: today's jobs first, phone-sized. */
export async function MyDay({ user }: { user: CurrentUser }) {
  if (!user.employeeId) {
    return (
      <p className="rounded-md bg-white p-6 text-sm shadow-card">
        Your Sparks login isn&apos;t linked to an employee record yet, so there&apos;s no schedule to show. Ask the office to link you in Settings → Users.
      </p>
    );
  }
  const now = new Date();
  const today = reginaDayRange(now);
  const soonEnd = reginaDayRange(now, 4).start;
  const [employee, todayEntries, upcoming, unscheduled, hoursToday] = await Promise.all([
    db.employee.findUnique({ where: { id: user.employeeId }, select: { firstName: true } }),
    db.scheduleEntry.findMany({
      where: { employeeId: user.employeeId, startsAt: { lt: today.end }, endsAt: { gt: today.start } },
      orderBy: { startsAt: "asc" },
      include: {
        workOrder: {
          include: { customer: { select: { name: true } }, jobSite: true, contact: true, status: true, priority: true },
        },
      },
    }),
    db.scheduleEntry.findMany({
      where: { employeeId: user.employeeId, startsAt: { gte: today.end, lt: soonEnd } },
      orderBy: { startsAt: "asc" },
      include: { workOrder: { select: { id: true, number: true, summary: true, jobSite: { select: { street: true } } } } },
    }),
    db.workOrder.findMany({
      where: { assignments: { some: { employeeId: user.employeeId } }, status: { isClosed: false }, scheduleEntries: { none: { employeeId: user.employeeId, endsAt: { gte: today.start } } } },
      orderBy: { number: "desc" },
      take: 10,
      include: { status: true, customer: { select: { name: true } } },
    }),
    db.timeEntry.aggregate({ where: { employeeId: user.employeeId, date: { equals: new Date(`${today.start.toISOString().slice(0, 10)}T00:00:00Z`) } }, _sum: { hoursHundredths: true } }),
  ]);
  const hour = Number(now.toLocaleString("en-CA", { timeZone: TIME_ZONE, hour: "numeric", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-CA", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{greeting}, {employee?.firstName}</h1>
      <div className="mt-2 h-1 w-12 rounded-full bg-brand" aria-hidden />
      <p className="mt-3 text-sm text-muted">{dateLabel}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-white p-4 shadow-card">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Hours logged today</div>
          <div className="text-2xl font-extrabold tabular-nums">{formatHours(hoursToday._sum.hoursHundredths ?? 0)}</div>
        </div>
        <div className="ml-auto">
          <LinkButton href="/timesheets">Log time</LinkButton>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wide">Today</h2>
      {todayEntries.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-muted">Nothing scheduled today.</p>
      ) : (
        <ol className="space-y-3">
          {todayEntries.map((e) => {
            const w = e.workOrder;
            const address = w ? `${w.jobSite.street}, ${w.jobSite.city}` : null;
            return (
              <li key={e.id} className="rounded-md border-l-4 border-brand bg-white p-4 shadow-card">
                <div className="text-sm font-bold">{formatTime(e.startsAt)} – {formatTime(e.endsAt)}</div>
                {w ? (
                  <>
                    <Link href={`/work-orders/${w.id}`} className="mt-1 block text-base font-semibold hover:underline">
                      {w.number}: {w.summary}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge color={w.status.color}>{w.status.label}</Badge>
                      {w.priority.code !== "NORMAL" && <Badge color={w.priority.color}>{w.priority.label}</Badge>}
                    </div>
                    <div className="mt-2 text-sm">{w.customer.name} · {w.jobSite.name}</div>
                    <a href={mapLink(address!)} target="_blank" rel="noreferrer" className="mt-1 block text-sm font-semibold underline">
                      {address}
                    </a>
                    {w.contact && (
                      <div className="mt-1 text-sm text-muted">
                        {w.contact.firstName} {w.contact.lastName}
                        {(w.contact.mobile ?? w.contact.phone) && (
                          <>
                            {" · "}
                            <a href={`tel:${w.contact.mobile ?? w.contact.phone}`} className="underline">{w.contact.mobile ?? w.contact.phone}</a>
                          </>
                        )}
                      </div>
                    )}
                    {w.jobSite.accessNotes && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">{w.jobSite.accessNotes}</p>}
                  </>
                ) : (
                  <div className="mt-1 text-sm">{e.notes ?? "Scheduled"}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wide">Coming up</h2>
          <ul className="divide-y divide-gray-100 rounded-md bg-white shadow-card">
            {upcoming.map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm">
                <div className="font-semibold">{formatDateTime(e.startsAt)} – {formatTime(e.endsAt)}</div>
                {e.workOrder ? (
                  <Link href={`/work-orders/${e.workOrder.id}`} className="hover:underline">
                    {e.workOrder.number} {e.workOrder.summary} · {e.workOrder.jobSite.street}
                  </Link>
                ) : (
                  e.notes
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {unscheduled.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wide">Your other open work orders</h2>
          <ul className="divide-y divide-gray-100 rounded-md bg-white shadow-card">
            {unscheduled.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <Link href={`/work-orders/${w.id}`} className="font-semibold hover:underline">{w.number}</Link>
                <span>{w.summary}</span>
                <Badge color={w.status.color}>{w.status.label}</Badge>
                <span className="w-full text-muted">{w.customer.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

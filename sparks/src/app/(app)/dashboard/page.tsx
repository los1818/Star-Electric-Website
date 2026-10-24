import { requirePageAccess } from "@/lib/auth/server";
import { MyDay } from "./my-day";
import { OfficeDashboard } from "./office-dashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageAccess("dashboard:view");
  return user.role === "TECHNICIAN" ? <MyDay user={user} /> : <OfficeDashboard user={user} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminDashboard, { type AdminOverview, type AdminUsers } from "@/components/admin/dashboard";
import { backendFetch } from "@/lib/api/server";
import type { SessionResponse } from "@/lib/api/types";

export const metadata: Metadata = { title: "Admin dashboard | Tingraph" };

export default async function AdminPage() {
  const sessionResponse = await backendFetch("/api/v1/auth/session");
  if (!sessionResponse.ok) throw new Error("Session could not be checked.");
  const session = (await sessionResponse.json()) as SessionResponse;
  if (!session.user) redirect("/login?next=/admin");
  if (session.user.role !== "admin") redirect("/profile");

  const [overviewResponse, usersResponse] = await Promise.all([
    backendFetch("/api/v1/admin/overview"),
    backendFetch("/api/v1/admin/users"),
  ]);
  if (!overviewResponse.ok || !usersResponse.ok) throw new Error("Admin dashboard could not be loaded.");
  const [overview, users] = await Promise.all([
    overviewResponse.json() as Promise<AdminOverview>,
    usersResponse.json() as Promise<AdminUsers>,
  ]);
  return <AdminDashboard initialOverview={overview} initialUsers={users} admin={session.user} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/api/server";
import CheckoutPage from "@/components/account/checkout-page";
import type { Entitlements } from "@/lib/api/types";

export const metadata: Metadata = { title: "Checkout | Tingraph" };

export default async function Checkout({ searchParams }: PageProps<"/checkout">) {
  const response = await backendFetch("/api/v1/me");
  if (response.status === 401) redirect("/login?next=/checkout");
  if (!response.ok) throw new Error("Account could not be loaded.");
  const { entitlements } = (await response.json()) as { entitlements: Entitlements };
  const params = await searchParams;
  return <CheckoutPage orderId={typeof params.order === "string" ? params.order : ""} knownTimeZone={entitlements.time_zone} />;
}

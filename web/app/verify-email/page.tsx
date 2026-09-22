import type { Metadata } from "next";
import VerifyEmail from "@/components/account/verify-email";
import { AccountCard, AccountPage } from "@/components/account/shell";

export const metadata: Metadata = { title: "Confirm email — Tingraph" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token, next } = await searchParams;
  return (
    <AccountPage>
      <AccountCard label="Account" title="Confirm your email">
        <VerifyEmail
          token={typeof token === "string" ? token : ""}
          next={typeof next === "string" ? next : "/profile"}
        />
      </AccountCard>
    </AccountPage>
  );
}

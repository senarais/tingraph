import type { Metadata } from "next";
import Link from "next/link";
import { PasswordForm } from "@/components/account/forms";
import { AccountCard, AccountPage } from "@/components/account/shell";

export const metadata: Metadata = {
  title: "Set a new password | Tingraph",
};

/**
 * Where a reset link lands, already signed in by `/auth/callback`. Arriving
 * here without a session means the link did not work, and someone who has
 * forgotten their password cannot sign in to try again — so they are sent to
 * ask for another.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const resetToken = typeof token === "string" ? token : "";

  return (
    <AccountPage>
      <AccountCard label="Account" title="Set a new password">
        <PasswordForm token={resetToken} />
        <p className="mt-5 text-[12px] text-ink-soft">
          <Link href="/profile" className="underline underline-offset-4 hover:text-ink">
            Go to your profile
          </Link>
        </p>
      </AccountCard>
    </AccountPage>
  );
}

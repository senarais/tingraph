import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/account/forms";
import { AccountCard, AccountPage } from "@/components/account/shell";

export const metadata: Metadata = {
  title: "Forgot your password — Tingraph",
};

export default function ForgotPasswordPage() {
  return (
    <AccountPage>
      <AccountCard label="Account" title="Forgot your password?">
        <ForgotForm />
        <p className="mt-5 text-[12px] text-ink-soft">
          <Link href="/login" className="underline underline-offset-4 hover:text-ink">
            Back to sign in
          </Link>
        </p>
      </AccountCard>
    </AccountPage>
  );
}

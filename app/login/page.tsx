import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/account/forms";
import { AccountCard, AccountPage } from "@/components/account/shell";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in — Tingraph",
  description: "Sign in to Tingraph, or create an account.",
};

/** What went wrong on the way back from a link, said in words rather than as a code. */
const PROBLEMS = {
  link: "That link has expired or was already used. Sign in, or ask for a new one.",
  google: "Signing in with Google could not start. Try again in a moment.",
} as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, mode, error } = await searchParams;
  const target = safeNext(next);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect(target.startsWith("/login") ? "/profile" : target);
  }

  return (
    <AccountPage>
      <AccountCard label="Account" title="Your Tingraph account">
        <AuthForm
          next={target}
          mode={mode === "signup" ? "signup" : "signin"}
          problem={error === "link" || error === "google" ? PROBLEMS[error] : undefined}
        />
      </AccountCard>
    </AccountPage>
  );
}

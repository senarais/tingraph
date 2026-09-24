import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/account/forms";
import { AccountCard, AccountPage } from "@/components/account/shell";
import { safeNext } from "@/lib/auth";
import { backendFetch } from "@/lib/api/server";
import type { SessionResponse } from "@/lib/api/types";

export const metadata: Metadata = {
  title: "Sign in | Tingraph",
  description: "Sign in to Tingraph, or create an account.",
};

/** What went wrong on the way back from a link, said in words rather than as a code. */
const PROBLEMS = {
  link: "That link has expired or was already used. Sign in, or ask for a new one.",
  google: "Signing in with Google could not start. Try again in a moment.",
  "google-link": "An account already uses that email. Sign in with its existing method.",
} as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, mode, error } = await searchParams;
  const target = safeNext(next);

  const response = await backendFetch("/api/v1/auth/session");
  const session = response.ok ? ((await response.json()) as SessionResponse) : null;
  if (session?.user) {
    redirect(session.user.role === "admin" ? "/admin" : target.startsWith("/login") ? "/profile" : target);
  }

  return (
    <AccountPage>
      <AccountCard label="Account" title="Your Tingraph account">
        <AuthForm
          next={target}
          mode={mode === "signup" ? "signup" : "signin"}
          problem={typeof error === "string" && error in PROBLEMS ? PROBLEMS[error as keyof typeof PROBLEMS] : undefined}
        />
      </AccountCard>
    </AccountPage>
  );
}

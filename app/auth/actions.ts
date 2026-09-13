"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PASSWORD_MIN, safeNext, type FormState } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Signing in, signing up, and everything to do with a password.
 *
 * Every one of these is a POST that anyone can send without the form, so each
 * reads its own input and none trusts the page it was pressed on.
 */

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** A password is taken exactly as typed: a space at either end is part of it. */
function secret(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * The address a link from Supabase comes back to. Supabase only follows one
 * that is on the project's redirect list, and sends anything else to the
 * Site URL instead.
 */
async function callback(next: string): Promise<string> {
  const head = await headers();
  const origin =
    head.get("origin") ?? `${head.get("x-forwarded-proto") ?? "http"}://${head.get("host")}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  const password = secret(form, "password");
  if (!email || !password) {
    return { error: "Enter your email and your password.", values: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        error.code === "invalid_credentials"
          ? "That email and password do not match."
          : error.code === "email_not_confirmed"
            ? "Confirm your email first: the link is in your inbox."
            : error.message,
      values: { email },
    };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  const email = text(form, "email");
  const password = secret(form, "password");
  const values = { name, email };
  if (!email) {
    return { error: "Enter your email.", values };
  }
  if (password.length < PASSWORD_MIN) {
    return { error: `Use a password of at least ${PASSWORD_MIN} characters.`, values };
  }

  const next = safeNext(form.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: name ? { full_name: name.slice(0, 80) } : undefined,
      emailRedirectTo: await callback(next),
    },
  });
  if (error) {
    return { error: error.message, values };
  }

  // with email confirmation switched off, the account is signed in already
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }
  // an address that already has an account is answered exactly like a new
  // one, so nobody can learn from this form who has signed up
  return { notice: `A link is on its way to ${email}. Open it to finish creating your account.` };
}

export async function signInWithGoogle(form: FormData): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callback(safeNext(form.get("next"))) },
  });
  redirect(error || !data.url ? "/login?error=google" : data.url);
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  if (!email) {
    return { error: "Enter the email you signed up with." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await callback("/reset-password"),
  });
  if (error) {
    return { error: error.message, values: { email } };
  }
  return { notice: `If an account uses ${email}, a link to set a new password is on its way.` };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const password = secret(form, "password");
  if (password.length < PASSWORD_MIN) {
    return { error: `Use a password of at least ${PASSWORD_MIN} characters.` };
  }
  if (password !== secret(form, "confirm")) {
    return { error: "The two passwords are not the same." };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login?next=/profile");
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: error.code === "same_password" ? "That is already your password." : error.message,
    };
  }
  return { notice: "Password updated." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // this device only: signing out of one browser should not sign out another
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/");
}

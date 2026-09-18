import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import {
  AvatarUpload,
  PasswordForm,
  ProfileDetails,
  SectionHead,
} from "@/components/account/forms";
import { AccountPage } from "@/components/account/shell";
import { SlabButton } from "@/components/editor/ui";
import { PROFILE_FIELDS, type ProfileField, type ProfileInput } from "@/lib/auth";
import { isPlanTier, PLAN_LIMITS, planName } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your profile — Tingraph",
};

const SECTIONS = [
  { href: "#plan", label: "Plan & usage" },
  { href: "#details", label: "Details" },
  { href: "#security", label: "Security" },
  { href: "#accounts", label: "Connected accounts" },
];

const PROVIDER_NAMES: Record<string, string> = { email: "Email", google: "Google" };

function since(timestamp: string | undefined): string {
  return timestamp
    ? new Date(timestamp).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
}

export default async function ProfilePage() {
  const supabase = await createClient();
  // the whole record rather than the token's claims: this page lists the
  // ways in, and only the record has those
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/profile");
  }

  const { data: row } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_url, profession, affiliation, location, website, bio, tier")
    .eq("id", user.id)
    .maybeSingle();
  const { data: usage } = await supabase.rpc("get_my_entitlements").single();
  const profile = Object.fromEntries(
    (Object.keys(PROFILE_FIELDS) as ProfileField[]).map((field) => [field, row?.[field] ?? null]),
  ) as ProfileInput;
  const name = profile.full_name || profile.username || user.email || "";
  const identities = user.identities ?? [];
  const storedTier = row?.tier ?? "";
  const tier = isPlanTier(storedTier) ? storedTier : "free";
  const limits = PLAN_LIMITS[tier];
  const generationLimit = usage?.generation_limit ?? limits.generations;
  const number = (value: number) => value.toLocaleString("en-US");

  return (
    <AccountPage>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[250px_minmax(0,1fr)] md:items-start">
        <aside className="slab bg-white md:sticky md:top-20">
          <div className="flex flex-col items-center gap-3 border-b-2 border-edge px-4 py-6 text-center">
            <AvatarUpload url={row?.avatar_url ?? null} name={name} />
            <div className="w-full min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink">
                {profile.full_name || "No name yet"}
              </p>
              {profile.username && (
                <p className="truncate font-mono text-[12px] text-ink-soft">@{profile.username}</p>
              )}
              <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">{user.email}</p>
            </div>
          </div>
          <nav aria-label="Profile sections" className="flex flex-col p-2">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                href={section.href}
                className="border-2 border-transparent px-3 py-2 text-[13px] text-ink-soft transition-colors hover:border-edge hover:bg-bone hover:text-ink"
              >
                {section.label}
              </a>
            ))}
          </nav>
          <form action={signOut} className="border-t-2 border-edge p-3">
            <SlabButton type="submit" className="w-full">
              Sign out
            </SlabButton>
          </form>
        </aside>

        <div className="min-w-0 space-y-6">
          <section id="plan" className="slab scroll-mt-20 bg-white">
            <SectionHead title="Plan & usage">
              <span className="border-2 border-edge bg-edge px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-bone">
                {planName(tier)}
              </span>
            </SectionHead>
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <div className="border-2 border-edge bg-bone p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  Saved diagrams
                </p>
                <p className="mt-2 text-xl font-semibold text-ink">
                  {number(usage?.diagram_count ?? 0)} / {number(usage?.diagram_limit ?? limits.diagrams)}
                </p>
              </div>
              <div className="border-2 border-edge bg-bone p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  Generations today
                </p>
                <p className="mt-2 text-xl font-semibold text-ink">
                  {number(usage?.generation_used ?? 0)} / {generationLimit === null ? "Unlimited" : number(generationLimit)}
                </p>
              </div>
              <div className="border-2 border-edge bg-bone p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  AI tokens today
                </p>
                <p className="mt-2 text-xl font-semibold text-ink">
                  {number(usage?.ai_tokens_used ?? 0)} / {number(usage?.ai_token_limit ?? limits.aiTokens)}
                </p>
              </div>
            </div>
            <p className="border-t-2 border-edge px-5 py-3 text-[11.5px] text-ink-soft">
              Daily allowances reset at 00:00 UTC. Export options are available on every plan.
            </p>
          </section>

          <ProfileDetails profile={profile} />

          <section id="security" className="slab scroll-mt-20 bg-bone">
            <SectionHead title="Security" />
            <div className="p-5">
              <p className="max-w-prose text-[13px] leading-relaxed text-ink-soft">
                Choose a new password. From then on you can sign in with your
                email and that password, whichever way you signed up.
              </p>
              <div className="mt-4 max-w-sm">
                <PasswordForm />
              </div>
            </div>
          </section>

          <section id="accounts" className="slab scroll-mt-20 bg-white">
            <SectionHead title="Connected accounts" />
            <ul className="divide-y-2 divide-edge">
              {identities.map((identity) => (
                <li key={identity.identity_id} className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink">
                      {PROVIDER_NAMES[identity.provider] ?? identity.provider}
                    </p>
                    <p className="mt-1 truncate text-[12px] text-ink-soft">
                      {String(identity.identity_data?.email ?? user.email ?? "")}
                      {identity.created_at ? ` · since ${since(identity.created_at)}` : ""}
                    </p>
                  </div>
                  <span className="border-2 border-edge bg-edge px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-bone">
                    Connected
                  </span>
                </li>
              ))}
              {!identities.some((identity) => identity.provider === "google") && (
                <li className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink">Google</p>
                    <p className="mt-1 text-[12px] text-ink-soft">
                      Sign in with Google as {user.email} and it joins this account.
                    </p>
                  </div>
                  <span className="border-2 border-edge bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                    Not connected
                  </span>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </AccountPage>
  );
}

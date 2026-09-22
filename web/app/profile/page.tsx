import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AvatarUpload,
  ProfileDetails,
  SectionHead,
} from "@/components/account/forms";
import SignOutButton from "@/components/account/sign-out-button";
import { AccountPage } from "@/components/account/shell";
import { PROFILE_FIELDS, type ProfileField, type ProfileInput } from "@/lib/auth";
import { isPlanTier, PLAN_LIMITS, planName } from "@/lib/plans";
import { backendFetch } from "@/lib/api/server";
import type { Entitlements, User } from "@/lib/api/types";

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
  const response = await backendFetch("/api/v1/me");
  if (response.status === 401) {
    redirect("/login?next=/profile");
  }
  if (!response.ok) {
    throw new Error("Your account could not be loaded.");
  }
  const { user, entitlements: usage } = (await response.json()) as {
    user: User;
    entitlements: Entitlements;
  };
  const row = user.profile;
  const profile = Object.fromEntries(
    (Object.keys(PROFILE_FIELDS) as ProfileField[]).map((field) => [field, row[field] ?? null]),
  ) as ProfileInput;
  const name = profile.full_name || profile.username || user.email;
  const storedTier = usage.tier;
  const tier = isPlanTier(storedTier) ? storedTier : "free";
  const limits = PLAN_LIMITS[tier];
  const generationLimit = usage?.generation_limit ?? limits.generations;
  const number = (value: number) => value.toLocaleString("en-US");

  return (
    <AccountPage>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[250px_minmax(0,1fr)] md:items-start">
        <aside className="slab bg-white md:sticky md:top-20">
          <div className="flex flex-col items-center gap-3 border-b-2 border-edge px-4 py-6 text-center">
            <AvatarUpload url={row.avatar_url} name={name} />
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
          <div className="border-t-2 border-edge p-3"><SignOutButton /></div>
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
                Password changes start from a short-lived link sent to your email. Using the link
                signs every current device out.
              </p>
              {user.providers.includes("email") && (
                <a href="/forgot-password" className="slab-tight press mt-4 inline-block bg-white px-3 py-2 text-[12px] font-semibold text-ink">
                  Send password reset link
                </a>
              )}
            </div>
          </section>

          <section id="accounts" className="slab scroll-mt-20 bg-white">
            <SectionHead title="Connected accounts" />
            <ul className="divide-y-2 divide-edge">
              {user.providers.map((provider) => (
                <li key={provider} className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink">
                      {PROVIDER_NAMES[provider] ?? provider}
                    </p>
                    <p className="mt-1 truncate text-[12px] text-ink-soft">
                      {user.email} · since {since(user.created_at)}
                    </p>
                  </div>
                  <span className="border-2 border-edge bg-edge px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-bone">
                    Connected
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AccountPage>
  );
}

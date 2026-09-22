"use client";

import { useState } from "react";
import Link from "next/link";
import { APIError, publicJSON } from "@/lib/api/client";
import { SlabButton } from "@/components/editor/ui";
import { safeNext } from "@/lib/auth";
import { useLinkFragment } from "@/lib/link-fragment";

export default function VerifyEmail({ token: initialToken = "", next: initialNext = "/profile" }: { token?: string; next?: string }) {
  const fragment = useLinkFragment();
  const token = initialToken || fragment.get("token") || "";
  const next = safeNext(fragment.get("next") ?? initialNext);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [problem, setProblem] = useState("");

  const verify = async () => {
    setState("busy");
    setProblem("");
    try {
      await publicJSON("/api/v1/auth/verify-email", { token });
      setState("done");
    } catch (cause) {
      setProblem(cause instanceof APIError ? cause.message : "That link could not be verified.");
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink">Email confirmed. You can sign in.</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="slab-tight press block bg-edge px-3 py-2 text-center text-[12px] font-semibold text-bone">
          Sign in
        </Link>
      </div>
    );
  }

  if (!token) {
    return <p className="text-[13px] leading-relaxed text-alert">This confirmation link is missing or invalid.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-ink-soft">
        Confirm this email address to finish creating your Tingraph account.
      </p>
      {problem && <p role="alert" className="text-[12px] text-alert">{problem}</p>}
      <SlabButton tone="solid" disabled={state === "busy"} onClick={() => void verify()} className="w-full">
        {state === "busy" ? "Confirming…" : "Confirm email"}
      </SlabButton>
    </div>
  );
}

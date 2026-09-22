"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APIError, apiFetch, clearSessionCache } from "@/lib/api/client";
import { SlabButton } from "@/components/editor/ui";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  return (
    <div>
      <SlabButton
        className="w-full"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setProblem("");
          void apiFetch("/api/v1/auth/logout", { method: "POST" }).then(async (response) => {
            if (!response.ok && response.status !== 401) throw await APIError.from(response);
            clearSessionCache();
            router.replace("/");
            router.refresh();
          }).catch((cause) => {
            setProblem(cause instanceof Error ? cause.message : "Sign out failed. Try again.");
          }).finally(() => {
            setBusy(false);
          });
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </SlabButton>
      {problem && <p role="alert" className="mt-2 text-[11px] text-alert">{problem}</p>}
    </div>
  );
}

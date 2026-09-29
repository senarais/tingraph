"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";

export default function TimeZoneSync({ known }: { known: string | null }) {
  const router = useRouter();
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (known) return;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    let active = true;
    void apiFetch("/api/v1/me/time-zone", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time_zone: timeZone }),
    }).then((response) => {
      if (!response.ok) throw new Error("Could not set your local time zone.");
      if (active) router.refresh();
    }).catch(() => { if (active) setProblem("Could not set your local time zone. Reload to retry."); });
    return () => { active = false; };
  }, [known, router]);

  return problem ? <p role="alert" className="mx-auto max-w-6xl px-4 pt-3 text-[12px] text-alert">{problem}</p> : null;
}

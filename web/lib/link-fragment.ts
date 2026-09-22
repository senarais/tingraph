"use client";

import { useSyncExternalStore } from "react";

function subscribe(notify: () => void): () => void {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

export function useLinkFragment(): URLSearchParams {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return new URLSearchParams(hash.slice(1));
}

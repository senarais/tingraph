import type { ReactNode } from "react";
import { Mark } from "@/components/site/diagram-art";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";

/** The public pages' chrome, around an account page. */
export function AccountPage({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-bone">{children}</main>
      <SiteFooter />
    </>
  );
}

/**
 * One window on the bone ground, framed the way the catalogue's is: a black
 * border, an unblurred offset shadow and a title bar.
 */
export function AccountCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="border-2 border-edge bg-white" style={{ boxShadow: "8px 8px 0 var(--edge)" }}>
        <div className="flex items-center gap-3 border-b-2 border-edge bg-bone px-4 py-3">
          <Mark className="h-4 w-4 text-ink" />
          <span className="font-mono text-[12.5px] font-semibold text-ink">{label}</span>
        </div>
        <div className="p-5 sm:p-6">
          <h1 className="font-mono text-2xl font-semibold tracking-[-0.03em] text-ink">{title}</h1>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

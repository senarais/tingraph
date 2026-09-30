"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { BookOpen, Search } from "lucide-react";

export default function DocsSidebar({ groups }: { groups: { title: string; links: { href: string; title: string }[] }[] }) {
  const path = usePathname();
  const id = useId();
  const [query, setQuery] = useState("");
  const visible = groups.map((group) => ({ ...group, links: group.links.filter((link) => `${group.title} ${link.title}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter((group) => group.links.length);

  const navigation = (suffix: string) => (
    <div className="space-y-7 p-5 lg:p-0">
      <div>
        <label htmlFor={`${id}-${suffix}`} className="mb-2 block font-mono text-[11px] font-semibold text-ink-soft">Find a guide</label>
        <div className="flex items-center gap-2 border-2 border-edge bg-white px-3">
          <Search size={14} aria-hidden="true" />
          <input id={`${id}-${suffix}`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles…" className="min-w-0 w-full bg-transparent py-2.5 text-[12px] outline-offset-2" />
        </div>
      </div>
      <nav aria-label="Documentation">
        {visible.map((group) => (
          <div key={group.title} className="mb-6 last:mb-0">
            <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{group.title}</h2>
            <ul className="space-y-1">
              {group.links.map((link) => (
                <li key={link.href}><Link href={link.href} aria-current={path === link.href ? "page" : undefined} onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} className={`block border-l-2 px-3 py-2 text-[12.5px] leading-snug ${path === link.href ? "border-edge bg-white font-semibold text-ink" : "border-transparent text-ink-soft hover:border-edge/30 hover:bg-white/60 hover:text-ink"}`}>{link.title}</Link></li>
              ))}
            </ul>
          </div>
        ))}
        {!visible.length && <p role="status" className="text-[12px] text-ink-soft">No matching guide. Try a diagram name.</p>}
      </nav>
    </div>
  );

  return (
    <aside className="min-w-0 border-b-2 border-edge bg-bone lg:border-b-0 lg:border-r-2">
      <details className="lg:hidden"><summary className="flex cursor-pointer items-center gap-2 px-4 py-4 font-mono text-[12px] font-semibold"><BookOpen size={16} aria-hidden="true" /> Browse documentation <span aria-hidden="true" className="ml-auto">↕</span></summary>{navigation("mobile")}</details>
      <div className="sticky top-20 hidden max-h-[calc(100dvh_-_6rem)] overflow-y-auto p-5 lg:block">{navigation("desktop")}</div>
    </aside>
  );
}

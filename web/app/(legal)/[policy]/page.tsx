import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";
import { POLICIES, POLICY_DATE, POLICY_VERSION, SUPPORT_EMAIL } from "@/lib/legal";

export const dynamicParams = false;

export function generateStaticParams() {
  return POLICIES.map((policy) => ({ policy: policy.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[policy]">): Promise<Metadata> {
  const { policy: slug } = await params;
  const policy = POLICIES.find((item) => item.slug === slug);
  return { title: `${policy?.title ?? "Policy"} | Tingraph`, description: policy?.description };
}

export default async function PolicyPage({ params }: PageProps<"/[policy]">) {
  const { policy: slug } = await params;
  const policy = POLICIES.find((item) => item.slug === slug);
  if (!policy) notFound();

  const contents = <ul className="mt-4 space-y-3">{policy.sections.map((section) => <li key={section.id}><a href={`#${section.id}`} className="text-[12px] leading-relaxed text-ink-soft hover:text-ink hover:underline">{section.title}</a></li>)}</ul>;
  const references = slug === "privacy" ? [
    { href: "https://ai.google.dev/gemini-api/terms?hl=en", title: "Google Gemini API terms & data practices" },
    { href: "https://policies.google.com/privacy", title: "Google Privacy Policy" },
    { href: "https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022", title: "Indonesia: Personal Data Protection Law (UU 27/2022)" },
  ] : slug === "terms" || slug === "billing-policy" ? [
    { href: "https://peraturan.bpk.go.id/Details/45288/uu-no-8-tahun-1999", title: "Indonesia: Consumer Protection Law (UU 8/1999)" },
  ] : [];

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-white">
        <div className="border-b-2 border-edge bg-bone">
          <header className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="font-mono text-[11px] font-semibold text-ink-soft">Tingraph · Indonesia</p>
            <h1 className="mt-5 max-w-[23ch] text-balance font-mono text-[clamp(2rem,5vw,4rem)] font-semibold leading-tight tracking-[-0.055em]">{policy.title}</h1>
            <p className="mt-5 max-w-[65ch] text-[15px] leading-[1.8] text-ink-soft">{policy.description}</p>
            <p className="mt-6 font-mono text-[11px] text-ink-soft">Effective {POLICY_DATE} · Version {POLICY_VERSION}</p>
          </header>
        </div>

        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          <aside className="min-w-0">
            <nav aria-label="Policy sections" className="sticky top-24 max-h-[calc(100dvh_-_7rem)] overflow-y-auto border-l-2 border-edge p-4">
              <details className="lg:hidden"><summary className="cursor-pointer font-mono text-[11px] font-semibold">On this page</summary>{contents}</details>
              <div className="hidden lg:block"><h2 className="font-mono text-[11px] font-semibold">On this page</h2>{contents}</div>
              <Link href="/site-map" className="mt-6 inline-block border-t border-edge/20 pt-4 text-[12px] font-semibold underline underline-offset-4">All pages & policies</Link>
            </nav>
          </aside>

          <article className="min-w-0 select-text">
            <section className="slab bg-bone p-5 sm:p-7">
              <h2 className="font-mono text-xl font-semibold tracking-tight">At a glance</h2>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-[13px] leading-relaxed text-ink-soft">{policy.summary.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="mt-4 text-[12px] leading-relaxed text-ink-soft">This summary helps you navigate. Read the full policy below for the details and qualifications.</p>
            </section>

            {policy.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-32 border-b border-edge/15 py-8">
                <h2 className="font-mono text-2xl font-semibold tracking-[-0.04em]">{section.title}</h2>
                {section.paragraphs.map((text) => <p key={text} className="mt-4 text-[14px] leading-[1.9] text-ink-soft">{text}</p>)}
                {section.bullets && <ul className="mt-4 list-disc space-y-4 pl-5 text-[14px] leading-[1.9] text-ink-soft">{section.bullets.map((text) => <li key={text}>{text}</li>)}</ul>}
              </section>
            ))}

            {references.length > 0 && <section className="border-b border-edge/15 py-8"><h2 className="font-mono text-xl font-semibold tracking-tight">Related references</h2><ul className="mt-4 space-y-3">{references.map((reference) => <li key={reference.href}><a href={reference.href} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ink-soft underline underline-offset-4 hover:text-ink">{reference.title} ↗</a></li>)}</ul></section>}

            <section className="mt-8 border-2 border-edge bg-bone p-5">
              <h2 className="font-mono text-[15px] font-semibold">Questions about this policy?</h2>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-3 inline-block break-all text-[13px] font-semibold underline underline-offset-4">{SUPPORT_EMAIL}</a>
              <nav aria-label="Related policies" className="mt-5 flex flex-wrap gap-x-5 gap-y-3">{POLICIES.filter((item) => item.slug !== slug).map((item) => <Link key={item.slug} href={`/${item.slug}`} className="text-[12px] text-ink-soft underline underline-offset-4 hover:text-ink">{item.title}</Link>)}</nav>
            </section>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

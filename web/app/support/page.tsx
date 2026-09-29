import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CreditCard, Mail, Phone, Shapes } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  title: "Support | Tingraph",
  description: "Find help with Tingraph diagrams, the editor, your account and Premium.",
};

const HELP = [
  { icon: Shapes, n: "01", title: "Explore the diagrams", body: "Find the right notation and open a working example to make your own.", href: "/build", action: "Browse notations" },
  { icon: BookOpen, n: "02", title: "Learn in the editor", body: "Open the built-in syntax guide or ask Tingraph AI for help with your source.", href: "/editor", action: "Open editor" },
  { icon: CreditCard, n: "03", title: "Plans & billing", body: "See your account details, saved diagrams and current plan in one place.", href: "/profile", action: "Go to profile" },
];

export default function SupportPage() {
  const email = "support@tingraph.com";
  const phone = "+62 851-5730-0042";

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-bone">
        <section className="relative overflow-hidden border-b-2 border-edge">
          <div aria-hidden="true" className="bracket-grid grid-fade absolute inset-0" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-20">
            <div className="site-enter">
              <span className="inline-block border-2 border-edge bg-white px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.12em]">HELP DESK / 02</span>
              <h1 className="mt-8 max-w-[12ch] text-balance font-mono text-[clamp(2.8rem,7vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.065em] text-ink">Let&apos;s figure it out<span className="text-navy">.</span></h1>
              <p className="mt-6 max-w-[50ch] text-[15px] leading-[1.8] text-ink-soft sm:text-base">A question about your diagram, account or plan? Find a starting point below, or reach out directly by email or phone.</p>
              <Link href="/features" className="mt-8 inline-flex items-center gap-2 font-mono text-[13px] font-semibold underline underline-offset-4 hover:text-navy">See what Tingraph can do <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="site-enter relative pb-5 pr-5" style={{ animationDelay: "120ms" }}>
              <div className="absolute inset-5 border-2 border-edge bg-[#e5ebf3]" aria-hidden="true" />
              <div className="slab relative bg-white">
                <div className="flex items-center justify-between border-b-2 border-edge px-5 py-3 font-mono text-[10px] font-semibold tracking-[0.12em]"><span>SUPPORT / AT A GLANCE</span><span>↗</span></div>
                <div className="p-6 sm:p-9">
                  <span className="inline-grid h-12 w-12 place-items-center border-2 border-edge bg-[#f1d483] font-mono text-2xl font-semibold">?</span>
                  <h2 className="mt-7 max-w-[15ch] font-mono text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">The right answer starts here.</h2>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">Choose a topic, open an example or get in touch using the details below.</p>
                  <div className="mt-8 grid grid-cols-3 divide-x-2 divide-edge border-2 border-edge bg-bone text-center font-mono text-[10px] font-semibold"><span className="px-2 py-3">DIAGRAMS</span><span className="px-2 py-3">EDITOR</span><span className="px-2 py-3">ACCOUNT</span></div>
                </div>
              </div>
              <span className="absolute bottom-0 right-0 border-2 border-edge bg-[#dce8df] px-3 py-2 font-mono text-[11px] font-semibold shadow-[3px_3px_0_var(--edge)]">WE&apos;RE HERE TO HELP</span>
            </div>
          </div>
        </section>

        <section className="border-b-2 border-edge bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-soft">FIND YOUR WAY / 01</p>
            <h2 className="mt-4 font-mono text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Where do you want to start?</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {HELP.map((item, index) => {
                const Icon = item.icon;
                return <article key={item.n} className="site-reveal slab flex flex-col bg-white p-6" style={{ animationDelay: `${index * 80}ms` }}><div className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center border-2 border-edge bg-bone"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span><span className="font-mono text-[11px] text-ink-soft">/ {item.n}</span></div><h3 className="mt-8 font-mono text-xl font-semibold tracking-tight">{item.title}</h3><p className="mt-3 flex-1 text-[13px] leading-[1.8] text-ink-soft">{item.body}</p><Link href={item.href} className="mt-8 inline-flex items-center gap-2 border-t-2 border-edge/15 pt-4 font-mono text-[12px] font-semibold hover:text-navy">{item.action} <ArrowRight size={15} aria-hidden="true" /></Link></article>;
              })}
            </div>
          </div>
        </section>

        <section className="border-b-2 border-edge bg-bone">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
              <div className="site-reveal"><p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-soft">GET IN TOUCH / 02</p><h2 className="mt-4 max-w-[13ch] text-balance font-mono text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">Still need a hand?</h2><p className="mt-5 max-w-[42ch] text-[14px] leading-[1.8] text-ink-soft">For a diagram issue, include the notation and the error you see. For an account or payment issue, use the email associated with your account; please don&apos;t send passwords or payment details.</p></div>
              <div className="grid gap-5 sm:grid-cols-2">
                <article className="site-reveal slab flex min-h-64 flex-col bg-white p-6"><span className="grid h-12 w-12 place-items-center border-2 border-edge bg-[#dce8df]"><Mail size={22} strokeWidth={1.7} aria-hidden="true" /></span><span className="mt-6 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink-soft">EMAIL SUPPORT</span><a href={`mailto:${email}`} className="mt-3 break-all font-mono text-lg font-semibold underline decoration-2 underline-offset-4 hover:text-navy">{email}</a><p className="mt-auto pt-6 text-[12px] leading-relaxed text-ink-soft">Questions about diagrams, accounts or Premium.</p></article>
                <article className="site-reveal slab flex min-h-64 flex-col bg-white p-6"><span className="grid h-12 w-12 place-items-center border-2 border-edge bg-[#f1d483]"><Phone size={22} strokeWidth={1.7} aria-hidden="true" /></span><span className="mt-6 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink-soft">PHONE</span><a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="mt-3 break-all font-mono text-lg font-semibold underline decoration-2 underline-offset-4 hover:text-navy">{phone}</a><p className="mt-auto pt-6 text-[12px] leading-relaxed text-ink-soft">Call about your diagram, account or plan.</p></article>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-edge text-bone"><div className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between"><div><p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-[#f1d483]">ONE MORE THING</p><h2 className="mt-3 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">Answers to common questions.</h2><p className="mt-3 text-[13px] text-white/70">Accounts, saving, AI, exports and Premium, all in one place.</p></div><Link href="/#faq" className="press w-fit border-2 border-bone bg-bone px-5 py-3 font-mono text-[13px] font-semibold text-ink shadow-[5px_5px_0_#505050]">Read the FAQ ↗</Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}

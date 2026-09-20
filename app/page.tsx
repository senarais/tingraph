import Link from "next/link";
import Image from "next/image";
import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import { DiagramArt } from "@/components/site/diagram-art";
import HeroDemo from "@/components/site/hero-demo";
import HowItWorks from "@/components/site/how-it-works";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";
import { ACCENTS, FEATURED_DIAGRAMS, READY_DIAGRAMS } from "@/lib/diagrams";

const AUDIENCES = [
  "Thesis figures",
  "Journal papers",
  "Course reports",
  "Process documentation",
  "Faculty structures",
];

const FEATURES = [
  {
    span: true,
    title: "The diagram is a text file",
    body: "One line declares an element, one arrow links two of them. The whole drawing is short enough to paste into a chat, keep in git next to the paper, or send to a supervisor who can read it without opening anything.",
  },
  {
    span: false,
    title: "Made for print, not for slides",
    body: "Black on white, 2px strokes, plain sans labels. A figure drops into a journal template without looking like it came from somewhere else.",
  },
  {
    span: false,
    title: "Layout you never manage",
    body: "Ranking, spacing and orthogonal routing come from the layout engine. One control flips the whole drawing from top-down to left-right.",
  },
  {
    span: true,
    title: "It stays editable after it generates",
    body: "What comes back is a live canvas, not a flat picture. Drag a box, retype a caption, drop another shape from the palette, draw an arrow in the same stroke as the generated ones. Generation gets you 90% there; the last 10% is yours.",
  },
  {
    span: false,
    title: "Formal ink when a template asks",
    body: "Five print-safe presets, or a colour you mix yourself, and the sheet is re-inked at once. A second setting swaps the whole drawing between a formal hand and a sketched one.",
  },
  {
    span: false,
    title: "Mistakes name their line",
    body: "A typo comes back as the line number and what was expected there, next to a live count of nodes and flows.",
  },
  {
    span: false,
    title: "Export exactly what the document needs",
    body: "One dialog with the picture in it: PNG, JPG, SVG or PDF, at a scale you set or a pixel size you type, with the margin and the background decided before anything is written.",
  },
];

const FAQ = [
  {
    q: "Do I need an account?",
    a: "No. There is no sign-up and no upload — the editor runs in your browser tab and the source never leaves it.",
  },
  {
    q: "Can I still edit the drawing after it generates?",
    a: "Yes, and this is the point. The generated shapes land on an editable canvas. Move them, retype labels, add shapes from the palette, or draw your own arrows in the same style. Re-running the source redraws from the code again.",
  },
  {
    q: "Is the output good enough for a journal or a thesis?",
    a: "It is drawn for that: black on white, even stroke weights, a formal sans for labels, and BPMN shapes that follow the BPMN 2.0 conventions. Export a PNG or a JPG at whatever scale the submission asks for, an SVG when the template takes vectors, or a one-page PDF.",
  },
  {
    q: "How much of a language do I have to learn?",
    a: "About five rules. Open a diagram with its keyword and a title, declare each element on its own line, then wire them with arrows. A cheat sheet for the active notation sits in the editor's side panel.",
  },
  {
    q: "Which notations can it draw today?",
    a: "Flowcharts, BPMN 2.0 with pools and lanes, org charts with role bands and sub-role units, and bar, line, pie and scatter charts. Every one of them is listed on the diagrams page, which is where new ones appear first.",
  },
  {
    q: "Where is my work saved?",
    a: "Nowhere but the tab you are in. Export the drawing and keep the source next to your document before you close it.",
  },
];

export default function Home() {
  return (
    <>
      <SiteNav />

      <main className="flex-1 bg-bone">
        {/* ------------------------------------------------------------ hero */}
        <section className="relative overflow-hidden border-b-2 border-edge">
          <div
            aria-hidden="true"
            className="bracket-grid grid-fade absolute inset-0"
          />

          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
            <div className="relative mx-auto max-w-5xl">
              <Image
                src="/mascot/2.png"
                alt=""
                width={1000}
                height={1000}
                sizes="112px"
                className="mascot-float-left pointer-events-none absolute left-0 top-24 hidden h-28 w-28 object-contain lg:block"
              />
              <Image
                src="/mascot/4.png"
                alt=""
                width={1000}
                height={1000}
                sizes="112px"
                className="mascot-float-right pointer-events-none absolute right-0 top-28 hidden h-28 w-28 object-contain lg:block"
              />

              <div className="mx-auto flex w-fit items-center gap-3 border-2 border-edge bg-white p-1 pl-4">
                <span className="text-[12.5px] text-ink">
                  {READY_DIAGRAMS.length} notations ready, more on the way
                </span>
                <Link
                  href="/build"
                  className="flex items-center gap-1.5 bg-edge px-2.5 py-1.5 font-mono text-[12px] font-semibold text-bone transition-colors hover:bg-navy"
                >
                  See them
                  <ArrowRight size={13} />
                </Link>
              </div>

              <h1 className="mx-auto mt-8 max-w-3xl text-center font-mono text-[1.75rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-5xl lg:text-6xl">
                Write the diagram.
                <br />
                Tingraph draws it.
              </h1>

              <p className="mx-auto mt-6 max-w-[46ch] text-center text-[15px] leading-relaxed text-ink-soft sm:text-base">
                A small language for flowcharts, BPMN 2.0, org charts, charts,
                mind maps and more. Spacing, routing and geometry are worked out
                for you, and every shape stays editable once it lands on the sheet.
              </p>
            </div>

            <div className="mt-10">
              <HeroDemo />
            </div>

            <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
              {AUDIENCES.map((item) => (
                <li
                  key={item}
                  className="border-2 border-edge bg-white/70 px-3 py-1.5 text-[12.5px] text-ink"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* -------------------------------------------------------- diagrams */}
        <section
          id="diagrams"
          className="scroll-mt-16 border-b-2 border-edge bg-white"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="max-w-xl text-balance font-mono text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
                  Pick a notation and start
                </h2>
                <p className="mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-soft">
                  Each one opens with a working example already in the editor, so
                  the first thing you do is change something rather than stare at
                  an empty sheet.
                </p>
              </div>
              <Link
                href="/build"
                className="slab-tight press flex items-center gap-2 bg-white px-4 py-2.5 text-[13px] font-medium text-ink"
              >
                All diagrams
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {FEATURED_DIAGRAMS.map((kind) => (
                <Link
                  key={kind.id}
                  href={`/editor?type=${kind.id}`}
                  className="slab press redraw flex flex-col bg-white"
                >
                  <div
                    className="flex h-60 items-center justify-center overflow-hidden border-b-2 border-edge px-5 py-4"
                    style={{ backgroundColor: ACCENTS[kind.accent].wash }}
                  >
                    <DiagramArt
                      id={kind.id}
                      accent={kind.accent}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-mono text-[17px] font-semibold tracking-tight text-ink">
                        {kind.name}
                      </h3>
                      <code className="border border-edge bg-bone px-1.5 py-0.5 font-mono text-[10.5px] text-ink">
                        {kind.keyword}
                      </code>
                    </div>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
                      {kind.summary}
                    </p>
                    <span className="mt-auto flex items-center gap-1.5 pt-4 font-mono text-[12.5px] font-semibold text-ink">
                      Open in editor
                      <ArrowRight size={13} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {READY_DIAGRAMS.length > FEATURED_DIAGRAMS.length && (
              <Link
                href="/build"
                className="slab-tight press mt-6 flex items-center justify-center gap-2 bg-white px-4 py-3.5 text-[13.5px] font-medium text-ink"
              >
                Browse all {READY_DIAGRAMS.length} notations, searchable
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </section>

        {/* -------------------------------------------------------- features */}
        <section id="features" className="scroll-mt-16 border-b-2 border-edge">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="max-w-2xl text-balance font-mono text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
              Why write a diagram instead of drawing one
            </h2>
            <p className="mt-3 max-w-[56ch] text-[14.5px] leading-relaxed text-ink-soft">
              Dragging boxes is fine until the fifth revision. Source text
              survives revisions, and so does everything you changed by hand
              afterwards.
            </p>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {FEATURES.map((feature, i) => (
                <Fragment key={feature.title}>
                  <article
                    className={`slab bg-white p-5 ${feature.span || i === FEATURES.length - 1 ? "md:col-span-2" : ""}`}
                  >
                    <h3 className="font-mono text-[16px] font-semibold tracking-tight text-ink">
                      {feature.title}
                    </h3>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
                      {feature.body}
                    </p>
                  </article>

                  {i === 0 && (
                    <div
                      aria-hidden="true"
                      className="slab flex min-h-56 items-center justify-center overflow-hidden bg-white p-3"
                    >
                      <Image
                        src="/mascot/3.png"
                        alt=""
                        width={1000}
                        height={1000}
                        sizes="(min-width: 768px) 352px, 100vw"
                        className="h-52 w-full object-contain"
                      />
                    </div>
                  )}

                  {i === 2 && (
                    <div
                      aria-hidden="true"
                      className="slab flex min-h-56 items-center justify-center overflow-hidden bg-white p-3"
                    >
                      <Image
                        src="/mascot/5.png"
                        alt=""
                        width={1000}
                        height={1000}
                        sizes="(min-width: 768px) 352px, 100vw"
                        className="h-52 w-full object-contain"
                      />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- how it works */}
        <section
          id="how"
          className="scroll-mt-16 border-b-2 border-edge bg-white"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="max-w-2xl text-balance font-mono text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
              Source in, sheet out, yours to finish
            </h2>
            <p className="mt-3 max-w-[54ch] text-[14.5px] leading-relaxed text-ink-soft">
              Three steps, and only the middle one is automatic.
            </p>

            <div className="mt-12">
              <HowItWorks />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- faq */}
        <section id="faq" className="scroll-mt-16 border-b-2 border-edge">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div>
              <h2 className="text-balance font-mono text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
                Questions
              </h2>
              <p className="mt-3 max-w-[40ch] text-[14.5px] leading-relaxed text-ink-soft">
                What people ask before they open the editor for the first time.
              </p>
            </div>

            <div className="relative pt-28 sm:pt-32">
              <Image
                src="/mascot/7.png"
                alt=""
                width={1000}
                height={1000}
                sizes="176px"
                className="pointer-events-none absolute left-4 top-0 z-10 h-40 w-40 object-contain sm:left-8 sm:h-44 sm:w-44"
              />
              <div className="slab divide-y-2 divide-edge bg-white">
                {FAQ.map((item, i) => (
                  <details key={item.q} open={i === 0} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 text-[14.5px] font-medium text-ink marker:content-none hover:bg-bone">
                      {item.q}
                      <span
                        aria-hidden="true"
                        className="ml-auto grid h-6 w-6 shrink-0 place-items-center border-2 border-edge font-mono text-[15px] leading-none group-open:bg-edge group-open:text-bone"
                      >
                        <span className="group-open:hidden">+</span>
                        <span className="hidden group-open:inline">−</span>
                      </span>
                    </summary>
                    <p className="border-t-2 border-edge bg-bone px-5 py-4 text-[13.5px] leading-relaxed text-ink-soft">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- cta */}
        <section className="bg-edge">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="max-w-[18ch] text-balance font-mono text-3xl font-semibold leading-[1.08] tracking-[-0.03em] text-bone sm:text-[2.75rem]">
                The sheet is already open.
              </h2>
              <p className="mt-4 max-w-[46ch] text-[14.5px] leading-relaxed text-white/70">
                No account, no install, nothing uploaded. Change a line of the
                example and watch the drawing follow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/editor"
                className="press border-2 border-bone bg-bone px-6 py-3.5 font-mono text-[14px] font-semibold text-ink"
                style={{ boxShadow: "5px 5px 0 #4b4b4b" }}
              >
                Open the editor
              </Link>
              <Link
                href="/build"
                className="border-2 border-white/40 px-6 py-3.5 font-mono text-[14px] font-semibold text-bone transition-colors hover:border-bone"
              >
                Browse diagrams
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

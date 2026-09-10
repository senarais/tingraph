"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Three steps, wired by a rule that draws itself through them as the reader
 * scrolls. The slabs are on the page from the start — only the rule and the
 * illustrations answer the scroll, so nothing important is hidden behind motion.
 */

const STEPS = [
  {
    n: "01",
    title: "Write the source",
    body: "Declare every element once, then wire the lines with an arrow. Comments, branch captions and dashed ties are part of the language.",
    art: <SourceArt />,
  },
  {
    n: "02",
    title: "It lays itself out",
    body: "Spacing, ranking, lane geometry and arrow routing are worked out for you. Errors come back with the line number that caused them.",
    art: <LayoutArt />,
  },
  {
    n: "03",
    title: "Edit, then export",
    body: "The result is a live canvas, not a picture. Drag anything, add shapes from the palette, then take a 4× PNG or an SVG.",
    art: <ExportArt />,
  },
];

function SourceArt() {
  return (
    <svg viewBox="0 0 200 78" className="w-full" aria-hidden="true">
      <g fill="none" stroke="#1e1e1e" strokeWidth={1.5}>
        <path d="M8 12h44" className="ink-path" pathLength={1} />
        <path
          d="M20 28h58"
          className="ink-path"
          pathLength={1}
          style={{ animationDelay: "90ms" }}
        />
        <path
          d="M20 42h44"
          className="ink-path"
          pathLength={1}
          style={{ animationDelay: "180ms" }}
        />
        <path
          d="M20 56h72"
          className="ink-path"
          pathLength={1}
          style={{ animationDelay: "270ms" }}
        />
        <path
          d="M8 70h10"
          className="ink-path"
          pathLength={1}
          style={{ animationDelay: "360ms" }}
        />
      </g>
      <rect
        x={98}
        y={51}
        width={6}
        height={11}
        fill="#1e1e1e"
        className="ink-fill"
        style={{ animationDelay: "400ms" }}
      />
      <g fill="none" stroke="#1e1e1e" strokeWidth={1.5} opacity={0.25}>
        <path d="M126 8v62M126 8h66v62h-66" strokeDasharray="4 5" />
      </g>
    </svg>
  );
}

function LayoutArt() {
  return (
    <svg viewBox="0 0 200 78" className="w-full" aria-hidden="true">
      <g stroke="#1e1e1e" strokeWidth={1.5} fill="#fff">
        <rect x={70} y={4} width={60} height={18} className="ink-path" pathLength={1} />
        <rect
          x={70}
          y={30}
          width={60}
          height={18}
          className="ink-path"
          pathLength={1}
          style={{ animationDelay: "140ms" }}
        />
        <rect
          x={70}
          y={56}
          width={60}
          height={18}
          className="ink-path"
          pathLength={1}
          style={{ animationDelay: "280ms" }}
        />
      </g>
      <g stroke="#1e1e1e" strokeWidth={1.5} fill="none">
        <path
          d="M100 22v6"
          className="ink-path"
          pathLength={1}
          style={{ animationDelay: "200ms" }}
        />
        <path
          d="M100 48v6"
          className="ink-path"
          pathLength={1}
          style={{ animationDelay: "340ms" }}
        />
      </g>
      {/* the measuring marks the layout works to */}
      <g stroke="#1e1e1e" strokeWidth={1} opacity={0.3}>
        <path d="M46 4v70M154 4v70" strokeDasharray="3 4" />
        <path d="M42 4h8M42 74h8M150 4h8M150 74h8" />
      </g>
    </svg>
  );
}

function ExportArt() {
  return (
    <svg viewBox="0 0 200 78" className="w-full" aria-hidden="true">
      <rect
        x={14}
        y={14}
        width={70}
        height={34}
        fill="#fff"
        stroke="#1e1e1e"
        strokeWidth={1.5}
        className="ink-path"
        pathLength={1}
      />
      {/* selection handles, the way the canvas shows a picked shape */}
      <g fill="#1e1e1e" className="ink-fill" style={{ animationDelay: "160ms" }}>
        <rect x={11} y={11} width={6} height={6} />
        <rect x={81} y={11} width={6} height={6} />
        <rect x={11} y={45} width={6} height={6} />
        <rect x={81} y={45} width={6} height={6} />
      </g>
      <path
        d="M84 31h28"
        stroke="#1e1e1e"
        strokeWidth={1.5}
        className="ink-path"
        pathLength={1}
        style={{ animationDelay: "240ms" }}
      />
      <polygon
        points="112,27 112,35 119,31"
        fill="#1e1e1e"
        className="ink-fill"
        style={{ animationDelay: "340ms" }}
      />
      <g
        className="ink-fill"
        style={{ animationDelay: "400ms" }}
        fontFamily="var(--font-plex-mono), monospace"
        fontSize={11}
        fontWeight={600}
      >
        <rect x={124} y={12} width={44} height={22} fill="#1e1e1e" />
        <text x={146} y={27} fill="#efede6" textAnchor="middle">
          PNG
        </text>
        <rect
          x={124}
          y={42}
          width={44}
          height={22}
          fill="#fff"
          stroke="#1e1e1e"
          strokeWidth={1.5}
        />
        <text x={146} y={57} fill="#1e1e1e" textAnchor="middle">
          SVG
        </text>
      </g>
    </svg>
  );
}

export default function HowItWorks() {
  const [reached, setReached] = useState(0);
  const steps = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const at = Number((entry.target as HTMLElement).dataset.step ?? 0);
          setReached((n) => Math.max(n, at + 1));
        }
      },
      { threshold: 0.4, rootMargin: "0px 0px -10% 0px" },
    );
    for (const el of steps.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <ol className="relative grid gap-6 md:grid-cols-3 md:gap-5">
      {/* the rule the steps hang off, filling in as each one is reached */}
      <div
        aria-hidden="true"
        className="absolute left-6 top-8 hidden h-0.5 w-[calc(100%-3rem)] bg-edge/15 md:block"
      >
        <div
          className="h-full bg-edge transition-[width] duration-700 ease-out"
          style={{ width: `${(reached / STEPS.length) * 100}%` }}
        />
      </div>

      {STEPS.map((step, i) => (
        <li
          key={step.n}
          data-step={i}
          ref={(el) => {
            steps.current[i] = el;
          }}
          className={reached > i ? "drawn relative" : "relative"}
        >
          <div
            className={`slab-tight relative z-10 mb-5 inline-flex h-8 items-center px-3 font-mono text-[12px] font-semibold transition-colors duration-500 ${
              reached > i ? "bg-edge text-bone" : "bg-white text-ink-faint"
            }`}
          >
            {step.n}
          </div>
          <div className="slab bg-white">
            <div className="border-b-2 border-edge bg-bone px-4 py-4">
              {step.art}
            </div>
            <div className="p-4">
              <h3 className="font-mono text-[15px] font-semibold tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

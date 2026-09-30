"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function ScrollReveal({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const panels = frame.current?.querySelectorAll<HTMLElement>(".site-reveal");
    if (!panels) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.revealed = "true";
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });

    for (const panel of panels) {
      const bounds = panel.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) continue;
      panel.dataset.revealed = "false";
      observer.observe(panel);
    }

    return () => {
      observer.disconnect();
      for (const panel of panels) delete panel.dataset.revealed;
    };
  }, []);

  return <div ref={frame}>{children}</div>;
}

import type { JSX } from "react";

/**
 * Line-art previews of the shapes the DSL can draw, at palette scale. They
 * follow the same bpmn.io conventions the canvas renders: thin circle for a
 * start event, thick for an end, filled marker for a throwing element.
 */

const VIEW_BOX = "0 0 44 32";

function Envelope({ filled }: { filled: boolean }) {
  return (
    <g>
      <rect
        x="17"
        y="13"
        width="10"
        height="7"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M17 13l5 3.5 5-3.5"
        fill="none"
        stroke={filled ? "var(--paper)" : "currentColor"}
        strokeWidth="1"
      />
    </g>
  );
}

function TaskMarker({ children }: { children: JSX.Element }) {
  return <g transform="translate(9, 8)">{children}</g>;
}

/** An org box: a washed band over an optional white body. */
function OrgBox({ band, body }: { band: number; body: number }) {
  const top = 16 - (band + body) / 2;
  return (
    <g>
      <rect
        x="5"
        y={top}
        width="34"
        height={band}
        fill="currentColor"
        fillOpacity="0.2"
      />
      {body > 0 && <rect x="5" y={top + band} width="34" height={body} fill="none" />}
    </g>
  );
}

const GLYPHS: Record<string, JSX.Element> = {
  role: <OrgBox band={9} body={11} />,
  "role-only": <OrgBox band={11} body={0} />,
  "role-units": (
    <g>
      <rect x="5" y="4" width="34" height="7" fill="currentColor" fillOpacity="0.2" />
      <rect x="5" y="11" width="34" height="17" fill="none" />
      <rect
        x="10"
        y="14"
        width="24"
        height="4"
        rx="2"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="none"
      />
      <rect
        x="10"
        y="21"
        width="24"
        height="4"
        rx="2"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="none"
      />
    </g>
  ),
  start: <circle cx="22" cy="16" r="10" strokeWidth="1.4" />,
  "msg-start": (
    <g>
      <circle cx="22" cy="16" r="10" strokeWidth="1.4" />
      <g transform="translate(0,0) scale(0.8) translate(5.5,4)">
        <Envelope filled={false} />
      </g>
    </g>
  ),
  timer: (
    <g>
      <circle cx="22" cy="16" r="10" strokeWidth="1.2" />
      <circle cx="22" cy="16" r="6.5" strokeWidth="1.2" />
      <path d="M22 12v4l3 2" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  ),
  end: <circle cx="22" cy="16" r="10" strokeWidth="3" />,
  "msg-end": (
    <g>
      <circle cx="22" cy="16" r="10" strokeWidth="3" />
      <g transform="scale(0.8) translate(5.5,4)">
        <Envelope filled />
      </g>
    </g>
  ),
  task: <rect x="6" y="5" width="32" height="22" rx="3" strokeWidth="1.4" />,
  "send-task": (
    <g>
      <rect x="6" y="5" width="32" height="22" rx="3" strokeWidth="1.4" />
      <TaskMarker>
        <g transform="scale(0.62) translate(-14,-11)">
          <Envelope filled />
        </g>
      </TaskMarker>
    </g>
  ),
  "recv-task": (
    <g>
      <rect x="6" y="5" width="32" height="22" rx="3" strokeWidth="1.4" />
      <TaskMarker>
        <g transform="scale(0.62) translate(-14,-11)">
          <Envelope filled={false} />
        </g>
      </TaskMarker>
    </g>
  ),
  "script-task": (
    <g>
      <rect x="6" y="5" width="32" height="22" rx="3" strokeWidth="1.4" />
      <path
        d="M10 9c2.5-1.6-2-2 1-4h4c-3 2 1.5 2.4-1 4z"
        strokeWidth="0.9"
        fill="none"
      />
      <path d="M11 8.5h3M11 10h3" strokeWidth="0.7" />
    </g>
  ),
  "user-task": (
    <g>
      <rect x="6" y="5" width="32" height="22" rx="3" strokeWidth="1.4" />
      <circle cx="12.5" cy="10" r="2" strokeWidth="0.9" />
      <path d="M9.5 15c0-2 1.5-3 3-3s3 1 3 3" strokeWidth="0.9" fill="none" />
    </g>
  ),
  "gw-ex": (
    <g>
      <path d="M22 3l13 13-13 13L9 16z" strokeWidth="1.4" />
      <path d="M18 12l8 8M26 12l-8 8" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  "gw-para": (
    <g>
      <path d="M22 3l13 13-13 13L9 16z" strokeWidth="1.4" />
      <path d="M22 10v12M16 16h12" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  "gw-inc": (
    <g>
      <path d="M22 3l13 13-13 13L9 16z" strokeWidth="1.4" />
      <circle cx="22" cy="16" r="5" strokeWidth="2" />
    </g>
  ),
  data: (
    <g>
      <path d="M14 3h10l6 6v20H14z" strokeWidth="1.4" />
      <path d="M24 3v6h6" strokeWidth="1.4" />
    </g>
  ),
  pool: (
    <g>
      <rect x="3" y="6" width="38" height="20" strokeWidth="1.4" />
      <path d="M11 6v20" strokeWidth="1.4" />
    </g>
  ),
  lane: (
    <g>
      <rect x="3" y="6" width="38" height="20" strokeWidth="1.4" />
      <path d="M11 6v20M11 16h30" strokeWidth="1.4" />
    </g>
  ),
  actor: (
    <g strokeWidth="1.4">
      <circle cx="22" cy="7" r="4" />
      <path d="M22 11v9M15 14.5h14M16 28l6-8 6 8" fill="none" />
    </g>
  ),
  usecase: <ellipse cx="22" cy="16" rx="17" ry="9" strokeWidth="1.4" />,
  system: (
    <g strokeWidth="1.4">
      <rect x="4" y="4" width="36" height="24" />
      <path d="M13 10h18" />
      <ellipse cx="22" cy="19" rx="9" ry="5" />
    </g>
  ),
  initial: <circle cx="22" cy="16" r="7" fill="currentColor" stroke="none" />,
  final: (
    <g>
      <circle cx="22" cy="16" r="9" strokeWidth="1.4" />
      <circle cx="22" cy="16" r="4.5" fill="currentColor" stroke="none" />
    </g>
  ),
  "flow-final": (
    <g strokeWidth="1.4">
      <circle cx="22" cy="16" r="9" />
      <path d="M17 11l10 10M27 11L17 21" />
    </g>
  ),
  action: <rect x="6" y="6" width="32" height="20" rx="7" strokeWidth="1.4" />,
  object: <rect x="6" y="6" width="32" height="20" strokeWidth="1.4" />,
  merge: <path d="M22 3l13 13-13 13L9 16z" strokeWidth="1.4" />,
  fork: <rect x="5" y="14" width="34" height="4" fill="currentColor" stroke="none" />,
  join: <rect x="5" y="14" width="34" height="4" fill="currentColor" stroke="none" />,
  entity: (
    <g strokeWidth="1.4">
      <rect x="5" y="5" width="34" height="22" />
      <path d="M5 12h34M13 12v15" />
      <rect x="5" y="5" width="34" height="7" fill="currentColor" fillOpacity="0.2" stroke="none" />
    </g>
  ),
  weak: (
    <g strokeWidth="1.4">
      <rect x="5" y="5" width="34" height="22" />
      <rect x="7.5" y="7.5" width="29" height="17" strokeWidth="1" />
      <path d="M5 12h34" />
    </g>
  ),
  process: <rect x="6" y="6" width="32" height="20" strokeWidth="1.4" />,
  decision: <path d="M22 3l13 13-13 13L9 16z" strokeWidth="1.4" />,
  io: (
    <rect
      x="6"
      y="6"
      width="32"
      height="20"
      strokeWidth="1.4"
      fill="var(--rule)"
    />
  ),
};

interface BpmnGlyphProps {
  type: string;
  className?: string;
}

export default function BpmnGlyph({ type, className }: BpmnGlyphProps) {
  const glyph = GLYPHS[type];
  return (
    <svg
      viewBox={VIEW_BOX}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      {glyph ?? GLYPHS.task}
    </svg>
  );
}

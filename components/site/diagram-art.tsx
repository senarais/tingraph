import { ACCENTS, type Accent } from "@/lib/diagrams";

/**
 * Miniatures of what each notation actually puts on the sheet — the same
 * shapes, stroke weights and fills the mapper draws with (see
 * lib/excalidraw-mapper/build-skeletons.ts), scaled down to a card.
 *
 * Every stroke carries pathLength={1}, so adding `drawn` to any ancestor makes
 * the whole preview ink itself in.
 */

const RULE = 2;
const CONNECTOR = 1.5;
const SHADE = "#e5e7eb";

interface ArtProps {
  accent?: Accent;
  className?: string;
}

/** A connector, stepped exactly the way the router steps a real one. */
function Line({ d, ink, delay = 0 }: { d: string; ink: string; delay?: number }) {
  return (
    <path
      d={d}
      pathLength={1}
      className="ink-path"
      style={{ animationDelay: `${delay}ms` }}
      stroke={ink}
      strokeWidth={CONNECTOR}
      strokeLinecap="butt"
      fill="none"
    />
  );
}

type Dir = "down" | "right" | "left" | "up";

/** The filled triangle bpmn.io puts on a sequence flow. */
function Head({
  x,
  y,
  dir,
  ink,
  delay = 0,
}: {
  x: number;
  y: number;
  dir: Dir;
  ink: string;
  delay?: number;
}) {
  const w = 3.6;
  const l = 6.5;
  const points =
    dir === "down"
      ? `${x - w},${y - l} ${x + w},${y - l} ${x},${y}`
      : dir === "up"
        ? `${x - w},${y + l} ${x + w},${y + l} ${x},${y}`
        : dir === "right"
          ? `${x - l},${y - w} ${x - l},${y + w} ${x},${y}`
          : `${x + l},${y - w} ${x + l},${y + w} ${x},${y}`;
  return (
    <polygon
      points={points}
      fill={ink}
      className="ink-fill"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

function Caption({
  x,
  y,
  ink,
  size = 9,
  weight = 400,
  children,
}: {
  x: number;
  y: number;
  ink: string;
  size?: number;
  weight?: number;
  children: React.ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      fill={ink}
      fontSize={size}
      fontWeight={weight}
      textAnchor="middle"
      dominantBaseline="middle"
      fontFamily="var(--font-plex-sans), system-ui, sans-serif"
    >
      {children}
    </text>
  );
}

/* --------------------------------------------------------------- flowchart */

export function FlowArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg
      viewBox="0 0 320 264"
      className={className}
      role="img"
      aria-label="Flowchart preview: start, read input, run checks, a valid decision, save record"
    >
      <ellipse
        cx={160}
        cy={22}
        rx={46}
        ry={15}
        fill="#fff"
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
      />
      <Caption x={160} y={23} ink={ink}>
        Start
      </Caption>

      <Line d="M160 37V52" ink={ink} delay={90} />
      <Head x={160} y={56} dir="down" ink={ink} delay={200} />

      <rect
        x={113}
        y={57}
        width={94}
        height={30}
        fill={SHADE}
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "120ms" }}
      />
      <Caption x={160} y={73} ink={ink}>
        Read input
      </Caption>

      <Line d="M160 87V102" ink={ink} delay={200} />
      <Head x={160} y={106} dir="down" ink={ink} delay={310} />

      <rect
        x={113}
        y={107}
        width={94}
        height={30}
        fill="#fff"
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "240ms" }}
      />
      <Caption x={160} y={123} ink={ink}>
        Run checks
      </Caption>

      <Line d="M160 137V150" ink={ink} delay={310} />
      <Head x={160} y={154} dir="down" ink={ink} delay={420} />

      <polygon
        points="160,155 208,182 160,209 112,182"
        fill="#fff"
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "360ms" }}
      />
      <Caption x={160} y={183} ink={ink}>
        Valid?
      </Caption>

      <Line d="M160 209V224" ink={ink} delay={440} />
      <Head x={160} y={228} dir="down" ink={ink} delay={540} />
      <Caption x={173} y={218} ink={ink} size={8}>
        Yes
      </Caption>

      <ellipse
        cx={160}
        cy={244}
        rx={46}
        ry={15}
        fill="#fff"
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "480ms" }}
      />
      <Caption x={160} y={245} ink={ink}>
        Save record
      </Caption>

      {/* the No branch runs back up the left margin into Run checks */}
      <Line d="M112 182H66V122H109" ink={ink} delay={520} />
      <Head x={113} y={122} dir="right" ink={ink} delay={640} />
      <Caption x={80} y={112} ink={ink} size={8}>
        No
      </Caption>
    </svg>
  );
}

/* -------------------------------------------------------------- bpmn 2.0 */

export function BpmnArt({ accent = "forest", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  /** A pool or lane name, set on its side in the header column, as bpmn.io does. */
  const sideways = (
    x: number,
    y: number,
    text: string,
    size: number,
    dim = false,
  ) => (
    <text
      // rotate(-90) maps (x, y) to (y, -x), so the pair below is written back
      x={-y}
      y={x}
      fill={ink}
      fontSize={size}
      transform="rotate(-90 0 0)"
      textAnchor="middle"
      dominantBaseline="middle"
      opacity={dim ? 0.8 : 1}
      fontFamily="var(--font-plex-sans), system-ui, sans-serif"
      fontWeight={dim ? 400 : 600}
    >
      {text}
    </text>
  );

  return (
    <svg
      viewBox="0 0 320 210"
      className={className}
      role="img"
      aria-label="BPMN preview: a pool split into an employee lane and a manager lane, with a start event, a task, an exclusive gateway and an end event"
    >
      {/* pool, its name column, the lane name column, then the lane rule */}
      <rect
        x={16}
        y={18}
        width={288}
        height={168}
        fill="#fff"
        stroke={ink}
        strokeWidth={CONNECTOR}
        pathLength={1}
        className="ink-path"
      />
      <Line d="M38 18V186" ink={ink} delay={80} />
      <Line d="M60 18V186" ink={ink} delay={110} />
      <Line d="M38 102H304" ink={ink} delay={150} />

      {sideways(27, 102, "Request", 9)}
      {sideways(49, 60, "Employee", 8, true)}
      {sideways(49, 144, "Manager", 8, true)}

      {/* employee lane: start event, then the task it kicks off */}
      <circle
        cx={88}
        cy={60}
        r={13}
        fill="#fff"
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "180ms" }}
      />
      <Caption x={88} y={86} ink={ink} size={8}>
        Submit
      </Caption>

      <Line d="M101 60H128" ink={ink} delay={260} />
      <Head x={135} y={60} dir="right" ink={ink} delay={360} />

      <rect
        x={135}
        y={42}
        width={90}
        height={36}
        rx={8}
        fill="#fff"
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "300ms" }}
      />
      <Caption x={180} y={54} ink={ink} size={8}>
        Fill vacation
      </Caption>
      <Caption x={180} y={66} ink={ink} size={8}>
        form
      </Caption>

      {/* down into the manager lane */}
      <Line d="M180 78V122" ink={ink} delay={400} />
      <Head x={180} y={128} dir="down" ink={ink} delay={520} />

      <polygon
        points="180,128 199,147 180,166 161,147"
        fill="#fff"
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "460ms" }}
      />
      {/* the X that marks an exclusive gateway */}
      <path
        d="M174 141l12 12M186 141l-12 12"
        stroke={ink}
        strokeWidth={1.6}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "560ms" }}
      />
      <Caption x={180} y={178} ink={ink} size={8}>
        Approved?
      </Caption>

      <Line d="M199 147H234" ink={ink} delay={580} />
      <Head x={240} y={147} dir="right" ink={ink} delay={680} />
      <Caption x={218} y={139} ink={ink} size={7}>
        Yes
      </Caption>

      <circle
        cx={256}
        cy={147}
        r={13}
        fill="#fff"
        stroke={ink}
        strokeWidth={3.5}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "640ms" }}
      />
      <Caption x={256} y={175} ink={ink} size={8}>
        Done
      </Caption>
    </svg>
  );
}

/* -------------------------------------------------------------- org chart */

export function OrgArt({ accent = "oxblood", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const wash = ACCENTS[accent].wash;
  const box = (
    x: number,
    y: number,
    w: number,
    role: string,
    name: string | null,
    delay: number,
  ) => (
    <g key={`${x}-${y}`}>
      <rect
        x={x}
        y={y}
        width={w}
        height={name ? 40 : 22}
        fill="#fff"
        stroke={ink}
        strokeWidth={CONNECTOR}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: `${delay}ms` }}
      />
      <rect x={x + 1} y={y + 1} width={w - 2} height={20} fill={wash} />
      <rect
        x={x}
        y={y}
        width={w}
        height={22}
        fill="none"
        stroke={ink}
        strokeWidth={CONNECTOR}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: `${delay}ms` }}
      />
      <Caption x={x + w / 2} y={y + 12} ink={ink} size={8} weight={600}>
        {role}
      </Caption>
      {name ? (
        <Caption x={x + w / 2} y={y + 31} ink={ink} size={7.5}>
          {name}
        </Caption>
      ) : null}
    </g>
  );

  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role="img"
      aria-label="Org chart preview: a dean over two vice deans, with a dashed advisory tie to the faculty senate"
    >
      {box(102, 16, 116, "DEKAN", "Dr. Gumgum Gumelar", 0)}

      {/* dashed advisory tie out to the senate */}
      <path
        d="M218 36H262"
        stroke={ink}
        strokeWidth={CONNECTOR}
        strokeDasharray="5 4"
        fill="none"
        opacity={0.85}
      />
      <rect
        x={262}
        y={25}
        width={54}
        height={22}
        fill={wash}
        stroke={ink}
        strokeWidth={CONNECTOR}
        pathLength={1}
        className="ink-path"
        style={{ animationDelay: "160ms" }}
      />
      <Caption x={289} y={37} ink={ink} size={7} weight={600}>
        SENAT
      </Caption>

      {/* the reporting bus: down out of the dean, across, down into each box */}
      <Line d="M160 56V92" ink={ink} delay={220} />
      <Line d="M74 92H246" ink={ink} delay={300} />
      <Line d="M74 92V120" ink={ink} delay={380} />
      <Line d="M246 92V120" ink={ink} delay={380} />
      <Head x={74} y={124} dir="down" ink={ink} delay={470} />
      <Head x={246} y={124} dir="down" ink={ink} delay={470} />

      {box(16, 125, 116, "WAKIL DEKAN I", "Mira Ariyani, Ph.D", 420)}
      {box(188, 125, 116, "WAKIL DEKAN II", "Dr. Lussy Dwiutami", 460)}
    </svg>
  );
}

/* ---------------------------------------------------------------- planned */

/** A grey stand-in for a notation that is announced but not drawable yet. */
export function PlannedArt({ id, className }: { id: string; className?: string }) {
  const ink = ACCENTS.slate.stroke;
  const shapes: Record<string, React.ReactNode> = {
    sequence: (
      <>
        <rect x={40} y={16} width={60} height={20} />
        <rect x={130} y={16} width={60} height={20} />
        <rect x={220} y={16} width={60} height={20} />
        <path d="M70 36v84M160 36v84M250 36v84" strokeDasharray="4 4" />
        <path d="M70 58h84M160 84h84M244 108H76" />
      </>
    ),
    erd: (
      <>
        <rect x={30} y={20} width={90} height={44} />
        <rect x={196} y={20} width={90} height={44} />
        <rect x={112} y={86} width={92} height={40} />
        <path d="M120 42h76M158 64v22" />
      </>
    ),
    state: (
      <>
        <rect x={26} y={44} width={76} height={32} rx={14} />
        <rect x={126} y={44} width={76} height={32} rx={14} />
        <rect x={226} y={44} width={64} height={32} rx={14} />
        <path d="M102 60h24M202 60h24M64 76v28h176V76" />
      </>
    ),
    mindmap: (
      <>
        <rect x={116} y={50} width={84} height={34} rx={16} />
        <path d="M116 67H62M200 67h54M158 84v26" />
        <rect x={16} y={54} width={46} height={26} rx={12} />
        <rect x={254} y={54} width={46} height={26} rx={12} />
        <rect x={126} y={110} width={64} height={26} rx={12} />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 320 146"
      className={className}
      fill="none"
      stroke={ink}
      strokeWidth={CONNECTOR}
      aria-hidden="true"
    >
      {shapes[id] ?? null}
    </svg>
  );
}

/** Picks the preview for a catalogue entry. */
export function DiagramArt({
  id,
  accent,
  className,
}: {
  id: string;
  accent?: Accent;
  className?: string;
}) {
  if (id === "flow") return <FlowArt accent={accent} className={className} />;
  if (id === "bpmn") return <BpmnArt accent={accent} className={className} />;
  if (id === "org") return <OrgArt accent={accent} className={className} />;
  return <PlannedArt id={id} className={className} />;
}

/* ------------------------------------------------------------- small marks */

/** The Tingraph mark: plotted axes with a line running over them. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path d="M1 15V1h14" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 12l3.5-6L11 9l3-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

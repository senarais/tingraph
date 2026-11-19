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

/* --------------------------------------------------------------- flowchart */

export function FlowArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg
      viewBox="0 0 320 264"
      className={className}
      role="img"
      aria-label="Flowchart preview"
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
      <Line d="M160 209V224" ink={ink} delay={440} />
      <Head x={160} y={228} dir="down" ink={ink} delay={540} />

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
      {/* the No branch runs back up the left margin into Run checks */}
      <Line d="M112 182H66V122H109" ink={ink} delay={520} />
      <Head x={113} y={122} dir="right" ink={ink} delay={640} />
    </svg>
  );
}

/* -------------------------------------------------------------- bpmn 2.0 */

export function BpmnArt({ accent = "forest", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg
      viewBox="0 0 320 210"
      className={className}
      role="img"
      aria-label="BPMN workflow preview"
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
      <Line d="M199 147H234" ink={ink} delay={580} />
      <Head x={240} y={147} dir="right" ink={ink} delay={680} />

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
    delay: number,
  ) => (
    <g key={`${x}-${y}`}>
      <rect
        x={x}
        y={y}
        width={w}
        height={40}
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
    </g>
  );

  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role="img"
      aria-label="Organization chart preview"
    >
      {box(102, 16, 116, 0)}

      {/* dashed advisory tie out to the senate */}
      <path
        d="M218 36H262"
        stroke={ink}
        strokeWidth={CONNECTOR}
        strokeDasharray="5 4"
        fill="none"
        opacity={0.85}
      />
      {box(262, 16, 54, 160)}

      {/* the reporting bus: down out of the dean, across, down into each box */}
      <Line d="M160 56V92" ink={ink} delay={220} />
      <Line d="M74 92H246" ink={ink} delay={300} />
      <Line d="M74 92V120" ink={ink} delay={380} />
      <Line d="M246 92V120" ink={ink} delay={380} />
      <Head x={74} y={124} dir="down" ink={ink} delay={470} />
      <Head x={246} y={124} dir="down" ink={ink} delay={470} />

      {box(16, 125, 116, 420)}
      {box(188, 125, 116, 460)}
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

/* ------------------------------------------------------------------ charts */

/** The eight hues the charts hand out, in the order they hand them out. */
const HUES = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

function Plot({
  children,
  ink,
  className,
  rules = [40, 80, 120],
}: {
  children: React.ReactNode;
  ink: string;
  className?: string;
  rules?: number[];
}) {
  return (
    <svg
      viewBox="0 0 320 180"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke={ink}
      strokeWidth={RULE}
    >
      {rules.map((y) => (
        <path key={y} d={`M44 ${y}h248`} stroke={SHADE} strokeWidth={1} />
      ))}
      <path d="M44 16v144h248" pathLength={1} className="ink-path" strokeLinecap="butt" />
      {children}
    </svg>
  );
}

export function BarArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const heights = [58, 108, 84, 126, 70];
  return (
    <Plot ink={ink} className={className}>
      {heights.map((height, index) => (
        <rect
          key={index}
          x={62 + index * 48}
          y={160 - height}
          width={30}
          height={height}
          fill={ACCENTS[accent].stroke}
          stroke="none"
        />
      ))}
    </Plot>
  );
}

export function LineArt({ accent = "forest", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const runs = [
    { d: "M62 140L110 104L158 78L206 56L254 30", hue: HUES[0] },
    { d: "M62 46L110 88L158 112L206 132L254 146", hue: HUES[1] },
  ];
  return (
    <Plot ink={ink} className={className}>
      {runs.map((run) => (
        <path
          key={run.d}
          d={run.d}
          stroke={run.hue}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="ink-path"
        />
      ))}
      {runs.map((run) =>
        run.d
          .slice(1)
          .split("L")
          .map((pair) => pair.split(" ").map(Number))
          .map(([x, y]) => (
            <circle key={`${run.hue}-${x}`} cx={x} cy={y} r={4} fill={run.hue} stroke="none" />
          )),
      )}
    </Plot>
  );
}

export function PieArt({ accent = "oxblood", className }: ArtProps) {
  const shares = [0.34, 0.24, 0.19, 0.13, 0.1];
  let angle = -Math.PI / 2;
  const slices = shares.map((share, index) => {
    const to = angle + share * Math.PI * 2;
    const big = share > 0.5 ? 1 : 0;
    const d = `M160 90L${160 + Math.cos(angle) * 68} ${90 + Math.sin(angle) * 68}A68 68 0 ${big} 1 ${
      160 + Math.cos(to) * 68
    } ${90 + Math.sin(to) * 68}Z`;
    angle = to;
    return <path key={index} d={d} fill={HUES[index]} stroke="#ffffff" strokeWidth={2} />;
  });
  void accent;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true">
      {slices}
    </svg>
  );
}

export function ScatterArt({ accent = "slate", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const dots = [
    [70, 142], [92, 128], [112, 136], [134, 108], [152, 118], [172, 88],
    [192, 96], [210, 66], [232, 74], [252, 44], [270, 56],
  ];
  return (
    <Plot ink={ink} className={className}>
      <path d="M62 146L268 46" stroke={ink} strokeWidth={1.5} strokeDasharray="4 4" />
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={5} fill={HUES[0]} stroke="none" />
      ))}
    </Plot>
  );
}


/* ---------------------------------------------------------------- thinking */

export function MindArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const branches = [
    { angle: -90, hue: HUES[0] },
    { angle: -18, hue: HUES[1] },
    { angle: 54, hue: HUES[2] },
    { angle: 126, hue: HUES[3] },
    { angle: 198, hue: HUES[4] },
  ];
  const at = (deg: number, r: number) => [
    160 + Math.cos((deg * Math.PI) / 180) * r,
    90 + Math.sin((deg * Math.PI) / 180) * r,
  ];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      {branches.map((branch) => {
        const [x, y] = at(branch.angle, 62);
        return (
          <g key={branch.angle}>
            <path
              d={`M160 90L${x} ${y}`}
              stroke={branch.hue}
              strokeWidth={CONNECTOR}
              pathLength={1}
              className="ink-path"
            />
            <rect
              x={x - 24}
              y={y - 11}
              width={48}
              height={22}
              rx={6}
              fill="#ffffff"
              stroke={ink}
              strokeWidth={CONNECTOR}
            />
          </g>
        );
      })}
      <circle cx={160} cy={90} r={26} fill="#ffffff" stroke={ink} strokeWidth={RULE} />
    </svg>
  );
}

export function MatrixArt({ accent = "oxblood", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const fills = [
    ["#ffffff", "#fff2cc", "#ffffff", "#d9ead3"],
    ["#d9ead3", "#ffffff", "#f4cccc", "#ffffff"],
    ["#fff2cc", "#d9ead3", "#ffffff", "#f4cccc"],
  ];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <rect x={42} y={22} width={236} height={136} fill="#ffffff" stroke={ink} strokeWidth={RULE} />
      <rect x={42} y={22} width={70} height={52} fill="#e8eef5" />
      <rect x={112} y={22} width={83} height={20} fill="#dce9f8" />
      <rect x={195} y={22} width={83} height={20} fill="#dce9f8" />
      {fills.flatMap((row, rowIndex) => row.map((fill, columnIndex) => (
        <rect
          key={`${rowIndex}-${columnIndex}`}
          x={112 + columnIndex * 41.5}
          y={74 + rowIndex * 28}
          width={41.5}
          height={28}
          fill={fill}
        />
      )))}
      <path
        d="M112 22v136M195 22v20M153.5 42v116M195 42v116M236.5 42v116M42 74h236M42 102h236M42 130h236M112 42h166"
        stroke={ink}
        strokeWidth={CONNECTOR}
        pathLength={1}
        className="ink-path"
      />
      <path d="M51 88h48M51 116h40M51 144h44" stroke={ink} strokeWidth={3} opacity={0.35} />
      <path d="M126 87l6 6 11-13M209 87l6 6 11-13M168 115l6 6 11-13M251 143l6 6 11-13" stroke={ink} strokeWidth={2.5} />
    </svg>
  );
}

export function VennArt({ accent = "forest", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const rings = [
    [160, 62],
    [128, 116],
    [192, 116],
  ] as const;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      {rings.map(([cx, cy], index) => (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={48}
          fill={HUES[index]}
          fillOpacity={0.24}
          stroke={ink}
          strokeWidth={CONNECTOR}
          pathLength={1}
          className="ink-path"
        />
      ))}
    </svg>
  );
}

export function FishboneArt({ accent = "mono", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const bones = [42, 100, 158, 216];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <path
        d="M20 90h244"
        stroke={ink}
        strokeWidth={RULE}
        pathLength={1}
        className="ink-path"
      />
      <path d="M264 66l32 24-32 24z" fill={ink} stroke="none" />
      {bones.map((x, index) => {
        const up = index % 2 === 0;
        const y = up ? 32 : 148;
        return (
          <g key={x}>
            <path
              d={`M${x - 30} ${y}L${x} 90`}
              stroke={ink}
              strokeWidth={CONNECTOR}
              pathLength={1}
              className="ink-path"
            />
            <rect
              x={x - 58}
              y={y - 11}
              width={56}
              height={22}
              fill="#ffffff"
              stroke={ink}
              strokeWidth={CONNECTOR}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function PrismaArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const wash = ACCENTS[accent].wash;
  const bands = [
    { y: 10, height: 40 },
    { y: 60, height: 50 },
    { y: 120, height: 20 },
    { y: 150, height: 30 },
  ];
  const rows = [
    { y: 10, height: 40 },
    { y: 60, height: 20 },
    { y: 90, height: 20 },
    { y: 120, height: 20 },
    { y: 150, height: 30 },
  ];
  return (
    <svg viewBox="0 0 320 190" className={className} aria-hidden="true" fill="none">
      {bands.map((band) => (
        <rect
          key={band.y}
          x={8}
          y={band.y}
          width={16}
          height={band.height}
          fill={wash}
          stroke={ink}
          strokeWidth={CONNECTOR}
          pathLength={1}
          className="ink-path"
        />
      ))}
      {rows.map((row, index) => (
        <g key={row.y}>
          <rect
            x={36}
            y={row.y}
            width={150}
            height={row.height}
            fill="#ffffff"
            stroke={ink}
            strokeWidth={CONNECTOR}
            pathLength={1}
            className="ink-path"
          />
          {index < rows.length - 1 && (
            <>
              <rect
                x={218}
                y={row.y}
                width={92}
                height={row.height}
                fill="#ffffff"
                stroke={ink}
                strokeWidth={CONNECTOR}
                pathLength={1}
                className="ink-path"
              />
              <Line d={`M186 ${row.y + row.height / 2}H212`} ink={ink} />
              <Head x={216} y={row.y + row.height / 2} dir="right" ink={ink} />
            </>
          )}
          {index < rows.length - 1 && (
            <>
              <Line d={`M111 ${row.y + row.height}V${rows[index + 1].y - 6}`} ink={ink} />
              <Head x={111} y={rows[index + 1].y - 1} dir="down" ink={ink} />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

/* --------------------------------------------------------------------- uml */

/** The stick figure a use case diagram and a sequence diagram both draw. */
function Stick({ x, y, ink }: { x: number; y: number; ink: string }) {
  return (
    <g stroke={ink} strokeWidth={CONNECTOR} fill="none">
      <circle cx={x} cy={y} r={5} />
      <path d={`M${x} ${y + 5}v11M${x - 7} ${y + 9}h14M${x - 7} ${y + 24}l7-8 7 8`} />
    </g>
  );
}

export function UseCaseArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const ovals = [46, 90, 134];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <rect
        x={98}
        y={20}
        width={124}
        height={140}
        stroke={ink}
        strokeWidth={CONNECTOR}
        fill="#ffffff"
      />
      {ovals.map((cy) => (
        <ellipse
          key={cy}
          cx={160}
          cy={cy}
          rx={48}
          ry={19}
          stroke={ink}
          strokeWidth={CONNECTOR}
          fill="#ffffff"
          pathLength={1}
          className="ink-path"
        />
      ))}
      {ovals.map((cy) => (
        <Line key={`l${cy}`} d={`M50 ${86}L112 ${cy}`} ink={ink} />
      ))}
      <Line d="M208 90L264 90" ink={ink} />
      <Stick x={40} y={78} ink={ink} />
      <Stick x={274} y={78} ink={ink} />
    </svg>
  );
}

export function ActivityArt({ accent = "slate", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <rect x={40} y={14} width={240} height={152} stroke={ink} strokeWidth={CONNECTOR} />
      <path
        d="M40 38h240M160 14v152"
        stroke={ink}
        strokeWidth={CONNECTOR}
        pathLength={1}
        className="ink-path"
      />
      <circle cx={100} cy={58} r={8} fill={ink} />
      <rect
        x={62}
        y={82}
        width={76}
        height={26}
        rx={10}
        stroke={ink}
        strokeWidth={CONNECTOR}
        fill="#ffffff"
      />
      <rect
        x={182}
        y={82}
        width={76}
        height={26}
        rx={10}
        stroke={ink}
        strokeWidth={CONNECTOR}
        fill="#ffffff"
      />
      <path d="M100 122l16 16-16 16-16-16z" stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      <circle cx={220} cy={138} r={10} stroke={ink} strokeWidth={CONNECTOR} />
      <circle cx={220} cy={138} r={5} fill={ink} />
      <Line d="M100 66v16" ink={ink} />
      <Line d="M138 95h44" ink={ink} />
      <Line d="M100 108v14" ink={ink} />
      <Line d="M220 108v20" ink={ink} />
      <Head x={100} y={82} dir="down" ink={ink} />
      <Head x={182} y={95} dir="right" ink={ink} />
    </svg>
  );
}

export function SequenceArt({ accent = "oxblood", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const lanes = [64, 160, 256];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      {lanes.map((x) => (
        <g key={x}>
          <rect
            x={x - 34}
            y={12}
            width={68}
            height={26}
            stroke={ink}
            strokeWidth={CONNECTOR}
            fill="#ffffff"
          />
          <path d={`M${x} 38v130`} stroke={ink} strokeWidth={1} strokeDasharray="5 5" />
        </g>
      ))}
      <rect x={58} y={62} width={12} height={96} fill="#ffffff" stroke={ink} strokeWidth={1} />
      <rect x={154} y={86} width={12} height={54} fill="#ffffff" stroke={ink} strokeWidth={1} />
      <rect x={250} y={110} width={12} height={22} fill="#ffffff" stroke={ink} strokeWidth={1} />
      <Line d="M70 86h78" ink={ink} />
      <Head x={154} y={86} dir="right" ink={ink} />
      <Line d="M166 110h78" ink={ink} />
      <Head x={250} y={110} dir="right" ink={ink} />
      <path d="M250 132H172" stroke={ink} strokeWidth={CONNECTOR} strokeDasharray="5 4" />
      <Head x={166} y={132} dir="left" ink={ink} />
    </svg>
  );
}

export function ErdArt({ accent = "forest", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const wash = ACCENTS[accent].wash;
  const tables = [
    { x: 18, y: 26, rows: 3 },
    { x: 186, y: 16, rows: 2 },
    { x: 186, y: 110, rows: 2 },
  ];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      {tables.map((table) => {
        const height = 22 + table.rows * 18;
        return (
          <g key={`${table.x}-${table.y}`}>
            <rect
              x={table.x}
              y={table.y}
              width={116}
              height={height}
              stroke={ink}
              strokeWidth={CONNECTOR}
              fill="#ffffff"
            />
            <rect x={table.x} y={table.y} width={116} height={22} fill={wash} />
            <rect
              x={table.x}
              y={table.y}
              width={116}
              height={22}
              stroke={ink}
              strokeWidth={CONNECTOR}
            />
            <path
              d={`M${table.x + 26} ${table.y + 22}v${height - 22}`}
              stroke={ink}
              strokeWidth={1}
            />
            {Array.from({ length: table.rows }, (_, at) => (
              <path
                key={at}
                d={`M${table.x + 34} ${table.y + 32 + at * 18}h${at === 0 ? 62 : 48}`}
                stroke={ink}
                strokeWidth={1}
                opacity={0.55}
              />
            ))}
          </g>
        );
      })}
      <Line d="M134 62h30v-14h22" ink={ink} />
      <Line d="M134 62h30v80h22" ink={ink} />
      <path
        d="M186 42v12M186 136v12M178 48h-8M178 142h-8"
        stroke={ink}
        strokeWidth={CONNECTOR}
      />
      <path d="M186 48l-10-6M186 48l-10 6M186 142l-10-6M186 142l-10 6" stroke={ink} strokeWidth={CONNECTOR} />
    </svg>
  );
}

export function ArchitectureArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <rect x="72" y="13" width="235" height="153" rx="13" stroke={ink} strokeDasharray="5 3" />
      <text x="85" y="32" fontSize="10" fill={ink}>Cloud region</text>
      <path d="M20 93h62M142 93h27M229 93h27M201 113v24" stroke={ink} strokeWidth="2" />
      {[[11, 70, "APP"], [82, 70, "API"], [169, 70, "BUS"], [256, 70, "DB"], [169, 137, "LOG"]].map(([x, y, label]) => (
        <g key={String(label)}>
          <rect x={Number(x)} y={Number(y)} width="49" height="46" rx="5" fill="white" stroke={ink} strokeWidth="1.5" />
          <rect x={Number(x) + 12} y={Number(y) + 6} width="25" height="21" rx="3" fill={ink} />
          <text x={Number(x) + 24} y={Number(y) + 39} fontSize="9" fill={ink} textAnchor="middle">{label}</text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------- starter drawings */

/** One component card, as `ArchitectureArt` draws it. */
function Part({ x, y, label, ink, dashed = false }: { x: number; y: number; label: string; ink: string; dashed?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width="52" height="44" rx="5" fill="white" stroke={ink} strokeWidth="1.5" strokeDasharray={dashed ? "4 3" : undefined} />
      <rect x={x + 14} y={y + 6} width="24" height="19" rx="3" fill={ink} opacity={dashed ? 0.35 : 1} />
      <text x={x + 26} y={y + 37} fontSize="8.5" fill={ink} textAnchor="middle">{label}</text>
    </g>
  );
}

function Boundary({ x, y, width, height, label, ink }: { x: number; y: number; width: number; height: number; label: string; ink: string }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="10" stroke={ink} strokeDasharray="5 3" />
      <text x={x + 10} y={y + 15} fontSize="9" fill={ink}>{label}</text>
    </g>
  );
}

export function ContextArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Boundary x={96} y={16} width={212} height={150} label="Enterprise" ink={ink} />
      <circle cx="40" cy="70" r="11" stroke={ink} strokeWidth="1.5" />
      <path d="M20 112c0-17 9-27 20-27s20 10 20 27z" stroke={ink} strokeWidth="1.5" />
      <path d="M62 93h50M164 70l60-24M164 116l60 24" stroke={ink} strokeWidth="1.5" pathLength={1} className="ink-path" />
      <Part x={112} y={71} label="SYSTEM" ink={ink} />
      <Part x={226} y={26} label="CORE" ink={ink} dashed />
      <Part x={226} y={118} label="MAIL" ink={ink} dashed />
    </svg>
  );
}

export function ContainerArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Boundary x={64} y={14} width={192} height={154} label="System" ink={ink} />
      <path d="M54 93h12v-35h12M66 93v35h12M130 58h18v35h18M130 128h18v-35M218 93h48" stroke={ink} strokeWidth="1.5" pathLength={1} className="ink-path" />
      <Part x={2} y={71} label="USER" ink={ink} />
      <Part x={78} y={36} label="WEB" ink={ink} />
      <Part x={78} y={106} label="APP" ink={ink} />
      <Part x={166} y={71} label="API" ink={ink} />
      <Part x={266} y={71} label="EXT" ink={ink} dashed />
    </svg>
  );
}

export function ComponentArt({ accent = "slate", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Boundary x={76} y={14} width={160} height={154} label="API application" ink={ink} />
      <path d="M58 93h14v-45h14M72 93v45h14M138 48h20M138 138h20M210 48h48M210 138h48" stroke={ink} strokeWidth="1.5" pathLength={1} className="ink-path" />
      <Part x={6} y={71} label="SPA" ink={ink} />
      <Part x={86} y={26} label="AUTH" ink={ink} />
      <Part x={86} y={116} label="ACCT" ink={ink} />
      <Part x={158} y={26} label="SEC" ink={ink} />
      <Part x={158} y={116} label="FACADE" ink={ink} />
      <Part x={258} y={26} label="DB" ink={ink} dashed />
      <Part x={258} y={116} label="EXT" ink={ink} dashed />
    </svg>
  );
}

export function DeploymentArt({ accent = "slate", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Boundary x={6} y={46} width={74} height={88} label="Device" ink={ink} />
      <Boundary x={92} y={8} width={222} height={166} label="Cloud region" ink={ink} />
      <Boundary x={104} y={28} width={98} height={138} label="Cluster" ink={ink} />
      <Boundary x={212} y={28} width={92} height={138} label="Managed" ink={ink} />
      <path d="M69 93h58M153 94v14M179 130h56M179 128v-60h56" stroke={ink} strokeWidth="1.5" pathLength={1} className="ink-path" />
      <Part x={17} y={71} label="BROWSER" ink={ink} />
      <Part x={127} y={50} label="WEB" ink={ink} />
      <Part x={127} y={108} label="API" ink={ink} />
      <Part x={235} y={46} label="FILES" ink={ink} />
      <Part x={235} y={108} label="SQL" ink={ink} />
    </svg>
  );
}

/** A table with a heading row and a heading column, filled by `cell`. */
function Grid({
  ink,
  rows,
  columns,
  cell,
  head = "#e8eef5",
}: {
  ink: string;
  rows: number;
  columns: number;
  cell: (row: number, column: number) => { text?: string; fill?: string };
  head?: string;
}) {
  const x = 30;
  const y = 18;
  const side = 62;
  const top = 26;
  const width = (260 - side) / columns;
  const height = (146 - top) / rows;
  return (
    <g>
      <rect x={x} y={y} width={260} height={146} fill="#ffffff" />
      <rect x={x} y={y} width={260} height={top} fill={head} />
      <rect x={x} y={y} width={side} height={146} fill={head} />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: columns }, (_, c) => {
          const { text, fill } = cell(r, c);
          const cx = x + side + c * width;
          const cy = y + top + r * height;
          return (
            <g key={`${r}-${c}`}>
              {fill && <rect x={cx} y={cy} width={width} height={height} fill={fill} />}
              {text && (
                <text x={cx + width / 2} y={cy + height / 2 + 4} fontSize="10" fontWeight="600" fill={ink} textAnchor="middle">
                  {text}
                </text>
              )}
            </g>
          );
        }),
      )}
      <path
        d={[
          `M${x} ${y}h260v146h-260z`,
          `M${x} ${y + top}h260M${x + side} ${y}v146`,
          ...Array.from({ length: rows - 1 }, (_, r) => `M${x} ${y + top + (r + 1) * height}h260`),
          ...Array.from({ length: columns - 1 }, (_, c) => `M${x + side + (c + 1) * width} ${y}v146`),
        ].join("")}
        stroke={ink}
        strokeWidth={CONNECTOR}
        pathLength={1}
        className="ink-path"
      />
      {Array.from({ length: rows }, (_, r) => (
        <path key={r} d={`M${x + 8} ${y + top + r * height + height / 2}h${side - 18}`} stroke={ink} strokeWidth={3} opacity={0.35} />
      ))}
      {Array.from({ length: columns }, (_, c) => (
        <path key={c} d={`M${x + side + c * width + 8} ${y + top / 2}h${width - 16}`} stroke={ink} strokeWidth={3} opacity={0.35} />
      ))}
    </g>
  );
}

export function SwotArt({ accent = "forest", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const letters = [["S", "W"], ["O", "T"]];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Grid ink={ink} rows={2} columns={2} cell={(r, c) => ({ text: letters[r][c] })} />
    </svg>
  );
}

export function RaciArt({ accent = "oxblood", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const marks = [["A", "R", "C", "I"], ["I", "A", "R", "C"], ["C", "I", "A", "R"]];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Grid ink={ink} rows={3} columns={4} cell={(r, c) => ({ text: marks[r][c] })} />
    </svg>
  );
}

export function DecisionArt({ accent = "oxblood", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const scores = [["4", "4", "5", "33"], ["5", "3", "4", "31"], ["3", "4", "3", "28"]];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Grid
        ink={ink}
        rows={3}
        columns={4}
        cell={(r, c) => ({ text: scores[r][c], fill: c === 3 ? ACCENTS[accent].wash : r % 2 ? "#f6f6f4" : undefined })}
      />
    </svg>
  );
}

export function HeatmapArt({ accent = "oxblood", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const shades = ["#fff7f3", "#fde0dd", "#fcc5c0", "#fa9fb5", "#f768a1", "#dd3497", "#ae017e"];
  const values = [[1, 3, 2, 4, 2], [0, 2, 1, 3, 1], [1, 5, 3, 6, 2]];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Grid ink={ink} rows={3} columns={5} cell={(r, c) => ({ fill: shades[values[r][c]] })} />
    </svg>
  );
}

/** A Studio sheet: several drawings, in several notations, on one sheet. */
export function StudioArt({ accent = "slate", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <rect x="10" y="10" width="300" height="160" stroke={ink} strokeDasharray="4 4" opacity={0.45} />
      {/* a flowchart */}
      <rect x="28" y="26" width="58" height="22" rx="11" fill="white" stroke={ink} strokeWidth={CONNECTOR} />
      <rect x="28" y="68" width="58" height="22" fill="white" stroke={ink} strokeWidth={CONNECTOR} />
      <path d="M57 104l20 14-20 14-20-14z" fill="white" stroke={ink} strokeWidth={CONNECTOR} />
      <Line d="M57 48v20M57 90v14" ink={ink} />
      {/* a bar chart */}
      <path d="M118 32v62h80" stroke={ink} strokeWidth={CONNECTOR} />
      {[[128, 58], [146, 44], [164, 70], [182, 50]].map(([x, top]) => (
        <rect key={x} x={x} y={top} width="12" height={94 - top} fill={ink} opacity={0.75} />
      ))}
      {/* an org chart */}
      <rect x="236" y="26" width="52" height="20" fill="white" stroke={ink} strokeWidth={CONNECTOR} />
      <rect x="220" y="66" width="36" height="18" fill="white" stroke={ink} strokeWidth={CONNECTOR} />
      <rect x="268" y="66" width="36" height="18" fill="white" stroke={ink} strokeWidth={CONNECTOR} />
      <Line d="M262 46v10h-24v10M262 56h24v10" ink={ink} />
      {/* a Venn */}
      <circle cx="140" cy="132" r="22" stroke={ink} strokeWidth={CONNECTOR} />
      <circle cx="166" cy="132" r="22" stroke={ink} strokeWidth={CONNECTOR} />
      {/* a sequence */}
      <path d="M226 104v56M286 104v56" stroke={ink} strokeWidth={CONNECTOR} strokeDasharray="3 3" />
      <Line d="M226 122h56M286 142h-56" ink={ink} />
      <Head x={286} y={122} dir="right" ink={ink} />
      <Head x={226} y={142} dir="left" ink={ink} />
    </svg>
  );
}

/* ------------------------------------------------ class, dfd, state, tree */

export function GanttArt({ accent = "oxblood", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const wash = ACCENTS[accent].wash;
  const bars = [
    [96, 2, 2, 1],
    [126, 4, 3, 0.5],
    [156, 7, 4, 0],
  ];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <path d="M14 40h292M14 168h292" stroke={ink} strokeWidth={CONNECTOR} />
      {Array.from({ length: 11 }, (_, at) => (
        <path key={at} d={`M${86 + at * 20} 26v142`} stroke={ink} strokeWidth={0.5} opacity={0.35} />
      ))}
      <rect x={14} y={48} width={292} height={22} fill={wash} />
      {bars.map(([y, start, length, done]) => (
        <g key={y}>
          <path d={`M24 ${y + 8}h48`} stroke={ink} strokeWidth={1} opacity={0.55} />
          <rect x={86 + (start - 1) * 20} y={y} width={length * 20} height={16} fill={wash} />
          <rect x={86 + (start - 1) * 20} y={y} width={length * 20 * done} height={16} fill={ink} />
          <rect x={86 + (start - 1) * 20} y={y} width={length * 20} height={16} stroke={ink} strokeWidth={1} />
        </g>
      ))}
      <path d="M126 104h4v22M190 134h4v22" stroke={ink} strokeWidth={1} />
      <path d="M286 136l8 8-8 8-8-8z" fill={ink} />
    </svg>
  );
}

export function QuadrantArt({ accent = "forest", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const dots = [
    [118, 52],
    [96, 70],
    [214, 48],
    [104, 128],
    [236, 118],
  ];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <rect x={70} y={14} width={220} height={140} stroke={ink} strokeWidth={CONNECTOR} />
      <path d="M180 14v140M70 84h220" stroke={ink} strokeWidth={CONNECTOR} />
      <path d="M70 166h220M58 154V14" stroke={ink} strokeWidth={1} />
      <path d="M284 162l6 4-6 4M54 20l4-6 4 6" stroke={ink} strokeWidth={1} />
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={5} fill={ink} />
      ))}
    </svg>
  );
}

export function HistogramArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const wash = ACCENTS[accent].wash;
  const counts = [3, 7, 12, 9, 5, 2];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <path d="M44 20v140h252" stroke={ink} strokeWidth={CONNECTOR} />
      {counts.map((count, at) => (
        <rect
          key={at}
          x={58 + at * 38}
          y={160 - count * 11}
          width={38}
          height={count * 11}
          fill={wash}
          stroke={ink}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

export function ClassArt({ accent = "navy", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  const boxes = [
    { x: 112, y: 10, w: 96, rows: [1, 1] },
    { x: 30, y: 112, w: 96, rows: [2, 1] },
    { x: 194, y: 112, w: 96, rows: [2, 1] },
  ];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      {boxes.map((box) => {
        const attrs = box.rows[0] * 10 + 8;
        const ops = box.rows[1] * 10 + 8;
        const height = 18 + attrs + ops;
        return (
          <g key={box.x}>
            <rect x={box.x} y={box.y} width={box.w} height={height} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
            <path d={`M${box.x} ${box.y + 18}h${box.w}M${box.x} ${box.y + 18 + attrs}h${box.w}`} stroke={ink} strokeWidth={1} />
            <path d={`M${box.x + 30} ${box.y + 9}h36`} stroke={ink} strokeWidth={2} />
            {Array.from({ length: box.rows[0] + box.rows[1] }, (_, at) => (
              <path
                key={at}
                d={`M${box.x + 8} ${box.y + 27 + at * 10 + (at >= box.rows[0] ? 8 : 0)}h${at % 2 ? 46 : 60}`}
                stroke={ink}
                strokeWidth={1}
                opacity={0.55}
              />
            ))}
          </g>
        );
      })}
      <Line d="M78 112V88h164v24M160 88V58" ink={ink} />
      <path d="M160 46l-8 12h16z" stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
    </svg>
  );
}

export function DfdArt({ accent = "forest", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <rect x={14} y={70} width={64} height={38} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      <rect x={124} y={56} width={72} height={64} rx={9} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      <path d="M124 74h72" stroke={ink} strokeWidth={1} />
      <path d="M160 63v5" stroke={ink} strokeWidth={2} />
      <path d="M306 136H232v28h74M256 136v28" stroke={ink} strokeWidth={CONNECTOR} />
      <rect x={242} y={16} width={64} height={38} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      <Line d="M78 89h46" ink={ink} />
      <Head x={124} y={89} dir="right" ink={ink} />
      <Line d="M196 72h78V54" ink={ink} />
      <Head x={274} y={54} dir="up" ink={ink} />
      <Line d="M160 120v30h72" ink={ink} delay={120} />
      <Head x={232} y={150} dir="right" ink={ink} delay={120} />
    </svg>
  );
}

export function StateArt({ accent = "oxblood", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <circle cx={30} cy={60} r={8} fill={ink} />
      <rect x={64} y={42} width={84} height={36} rx={14} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      <rect x={186} y={34} width={104} height={52} rx={14} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      <path d="M186 54h104" stroke={ink} strokeWidth={1} />
      <path d="M196 66h58M196 76h44" stroke={ink} strokeWidth={1} opacity={0.55} />
      <path d="M106 112l14 14-14 14-14-14z" stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      <circle cx={238} cy={140} r={11} stroke={ink} strokeWidth={CONNECTOR} />
      <circle cx={238} cy={140} r={6} fill={ink} />
      <path d="M38 60h18M148 60h30M106 78v26M120 126h106M238 86v34" stroke={ink} strokeWidth={CONNECTOR} />
      <path d="M50 55l7 5-7 5M172 55l7 5-7 5M101 98l5 7 5-7M220 121l7 5-7 5M233 114l5 7 5-7" stroke={ink} strokeWidth={CONNECTOR} />
    </svg>
  );
}

export function TreeArt({ accent = "slate", className }: ArtProps) {
  const ink = ACCENTS[accent].stroke;
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" fill="none">
      <Line d="M160 42v18M76 60h168M76 60v16M160 60v16M244 60v16M76 104v18M36 122h80M36 122v16M116 122v16" ink={ink} />
      <rect x={124} y={14} width={72} height={28} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      {[40, 124, 208].map((x) => (
        <rect key={x} x={x} y={76} width={72} height={28} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" rx={x === 40 ? 0 : 10} />
      ))}
      {[4, 84].map((x) => (
        <rect key={x} x={x} y={138} width={64} height={28} rx={10} stroke={ink} strokeWidth={CONNECTOR} fill="#ffffff" />
      ))}
    </svg>
  );
}

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
  if (id === "bar") return <BarArt accent={accent} className={className} />;
  if (id === "line") return <LineArt accent={accent} className={className} />;
  if (id === "pie") return <PieArt accent={accent} className={className} />;
  if (id === "scatter") return <ScatterArt accent={accent} className={className} />;
  if (id === "mind") return <MindArt accent={accent} className={className} />;
  if (id === "matrix") return <MatrixArt accent={accent} className={className} />;
  if (id === "venn") return <VennArt accent={accent} className={className} />;
  if (id === "fishbone") return <FishboneArt accent={accent} className={className} />;
  if (id === "prisma") return <PrismaArt accent={accent} className={className} />;
  if (id === "usecase") return <UseCaseArt accent={accent} className={className} />;
  if (id === "activity") return <ActivityArt accent={accent} className={className} />;
  if (id === "sequence") return <SequenceArt accent={accent} className={className} />;
  if (id === "erd") return <ErdArt accent={accent} className={className} />;
  if (id === "architecture") return <ArchitectureArt accent={accent} className={className} />;
  if (id === "gantt") return <GanttArt accent={accent} className={className} />;
  if (id === "quadrant") return <QuadrantArt accent={accent} className={className} />;
  if (id === "histogram") return <HistogramArt accent={accent} className={className} />;
  if (id === "class") return <ClassArt accent={accent} className={className} />;
  if (id === "dfd") return <DfdArt accent={accent} className={className} />;
  if (id === "state") return <StateArt accent={accent} className={className} />;
  if (id === "tree") return <TreeArt accent={accent} className={className} />;
  if (id === "studio") return <StudioArt accent={accent} className={className} />;
  if (id === "system-context") return <ContextArt accent={accent} className={className} />;
  if (id === "container") return <ContainerArt accent={accent} className={className} />;
  if (id === "component") return <ComponentArt accent={accent} className={className} />;
  if (id === "deployment") return <DeploymentArt accent={accent} className={className} />;
  if (id === "swot") return <SwotArt accent={accent} className={className} />;
  if (id === "raci") return <RaciArt accent={accent} className={className} />;
  if (id === "decision-matrix") return <DecisionArt accent={accent} className={className} />;
  if (id === "heatmap") return <HeatmapArt accent={accent} className={className} />;
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

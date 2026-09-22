"use client";

import { shapeFamily } from "@/lib/layout/compute-layout";
import { DiagramCategory } from "@/lib/types";

/**
 * The shape under the pointer while it is being dragged onto the sheet.
 *
 * It is not an element yet: it is drawn in the DOM over the canvas, at the
 * size and the outline the shape will have once it lands, so the reader can
 * place it before committing to it. Nothing here touches the scene, so a drag
 * that ends outside the sheet leaves no trace and no undo step.
 */
export default function ShapeGhost({
  type,
  category,
  width,
  height,
  ink,
}: {
  type: string;
  category: DiagramCategory;
  width: number;
  height: number;
  ink: string;
}) {
  const family = shapeFamily(type, category);
  const inset = 1;
  const w = Math.max(1, width - inset * 2);
  const h = Math.max(1, height - inset * 2);
  const common = {
    fill: "#ffffff",
    fillOpacity: 0.55,
    stroke: ink,
    strokeWidth: 2,
    strokeDasharray: "6 4",
    vectorEffect: "non-scaling-stroke" as const,
  };

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="block"
    >
      {family === "ellipse" && (
        <ellipse cx={width / 2} cy={height / 2} rx={w / 2} ry={h / 2} {...common} />
      )}
      {family === "diamond" && (
        <polygon
          points={`${width / 2},${inset} ${width - inset},${height / 2} ${width / 2},${height - inset} ${inset},${height / 2}`}
          {...common}
        />
      )}
      {(family === "box" || family === "task") && (
        <rect
          x={inset}
          y={inset}
          width={w}
          height={h}
          rx={family === "task" ? 10 : 0}
          {...common}
        />
      )}
      {family === "document" && (
        // the folded corner a data object is drawn with
        <path
          d={`M${inset} ${inset} H${width - 10} L${width - inset} 10 V${height - inset} H${inset} Z M${width - 10} ${inset} V10 H${width - inset}`}
          {...common}
        />
      )}
    </svg>
  );
}

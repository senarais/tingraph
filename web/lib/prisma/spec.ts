import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a PRISMA flow diagram is.
 *
 * A systematic review reports how its records moved from identification to the
 * studies it finally included, and the PRISMA 2020 statement fixes the shape of
 * that report: four phases down the left, one main column of records, and a box
 * to the right of each step whose records were dropped. The counts are the
 * content; the drawing is the same every time.
 *
 * A step names the band it stands in, so the four strips are read from the
 * steps themselves rather than from a second list. Consecutive steps naming the
 * same band share one strip, which is why Screening can cover two rows.
 */

export type PrismaStyleId = "formal" | "banded" | "bold";

export interface PrismaStyle {
  id: PrismaStyleId;
  name: string;
  hint: string;
  /** the phase bands carry the ink's wash rather than the paper */
  bandFill: boolean;
  /** how heavy every outline and arrow is */
  lineWidth: number;
}

export const PRISMA_STYLES: PrismaStyle[] = [
  {
    id: "formal",
    name: "Formal",
    hint: "white boxes and hairlines",
    bandFill: false,
    lineWidth: 1.5,
  },
  {
    id: "banded",
    name: "Banded",
    hint: "the phase bands washed in the ink",
    bandFill: true,
    lineWidth: 1.5,
  },
  {
    id: "bold",
    name: "Bold",
    hint: "heavy outlines for print",
    bandFill: false,
    lineWidth: 2.5,
  },
];

export function prismaStyle(id: PrismaStyleId): PrismaStyle {
  return PRISMA_STYLES.find((entry) => entry.id === id) ?? PRISMA_STYLES[0];
}

/** One line inside a box: a caption and the number that goes with it. */
export interface PrismaLine {
  label: string;
  /** drawn as `(n = …)`; empty leaves the caption on its own */
  count: string;
}

export interface PrismaBox {
  title: string;
  count: string;
  items: PrismaLine[];
}

export interface PrismaStep extends PrismaBox {
  /** the phase this row stands in; consecutive equal names share one band */
  band: string;
  /** the records that left the flow at this row */
  side?: PrismaBox;
}

export interface PrismaOptions extends FigureSize {
  style: PrismaStyleId;
  /** draw the phase bands down the left */
  bands: boolean;
  fontSize: number;
}

export interface PrismaSpec {
  kind: "prisma";
  title: string;
  steps: PrismaStep[];
  options: PrismaOptions;
}

export function defaultPrismaOptions(): PrismaOptions {
  return {
    style: "formal",
    bands: true,
    fontSize: 12,
    width: 820,
    height: 660,
  };
}

/** The four bands of the PRISMA 2020 statement, in the order they run. */
export const PRISMA_PHASES = [
  "Identification",
  "Screening",
  "Eligibility",
  "Included",
];

/** The flow the notation opens with, and what Reset puts back. */
export function blankPrisma(): PrismaSpec {
  return {
    kind: "prisma",
    title: "PRISMA 2020 flow diagram",
    steps: [
      {
        band: "Identification",
        title: "Records identified from",
        count: "1423",
        items: [
          { label: "Databases", count: "1200" },
          { label: "Registers", count: "223" },
        ],
        side: {
          title: "Records removed before screening",
          count: "468",
          items: [
            { label: "Duplicate records removed", count: "300" },
            {
              label: "Records marked as ineligible by automation tools",
              count: "100",
            },
            { label: "Records removed for other reasons", count: "68" },
          ],
        },
      },
      {
        band: "Screening",
        title: "Records screened",
        count: "955",
        items: [],
        side: { title: "Records excluded", count: "812", items: [] },
      },
      {
        band: "Screening",
        title: "Reports sought for retrieval",
        count: "143",
        items: [],
        side: { title: "Reports not retrieved", count: "20", items: [] },
      },
      {
        band: "Eligibility",
        title: "Reports assessed for eligibility",
        count: "123",
        items: [],
        side: {
          title: "Reports excluded",
          count: "110",
          items: [
            { label: "Reason 1", count: "50" },
            { label: "Reason 2", count: "35" },
            { label: "Reason 3", count: "25" },
          ],
        },
      },
      {
        band: "Included",
        title: "Studies included in review",
        count: "13",
        items: [{ label: "Reports of included studies", count: "16" }],
      },
    ],
    options: defaultPrismaOptions(),
  };
}

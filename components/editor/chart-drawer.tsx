"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ChartOnSheet } from "@/lib/canvas/scene";
import {
  CHART_STYLES,
  PALETTES,
  effectivePalette,
  markColor,
  type ChartSeries,
  type ChartSpec,
} from "@/lib/chart/spec";
import { isChart, type DiagramCategory } from "@/lib/types";
import { Field, Segmented, SlabButton, Tick } from "@/components/editor/ui";

/**
 * Everything a chart is, as controls.
 *
 * The panel and the source are two hands on the same object: every control
 * here writes one field of the `ChartSpec` the chart carries, and every one of
 * those fields has a word in the language. Nothing is offered that cannot be
 * written down, and nothing can be written down that is not offered here.
 *
 * A control the chart in front of the reader has no use for is not drawn at
 * all — a pie has no bars to turn on their side — which is the same rule the
 * rail follows.
 */

interface ChartDrawerProps {
  category: DiagramCategory;
  chart: ChartOnSheet | null;
  onChange: (spec: ChartSpec) => void;
  onAdd: () => void;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** A field that holds what is being typed and hands over only what parses. */
function NumberField({
  value,
  onCommit,
  title,
  width = "w-full",
}: {
  value: number;
  onCommit: (value: number) => void;
  title?: string;
  width?: string;
}) {
  const [draft, setDraft] = useState(String(round(value)));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(round(value)));
  }
  return (
    <input
      value={draft}
      title={title}
      aria-label={title}
      inputMode="decimal"
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const parsed = Number(next);
        if (next.trim() !== "" && Number.isFinite(parsed)) {
          onCommit(parsed);
        }
      }}
      onBlur={() => setDraft(String(round(value)))}
      className={`${width} border-2 border-edge bg-white px-1.5 py-1 text-right font-mono text-[11.5px] text-ink`}
    />
  );
}

/** A caption field that hands over what was typed when the reader leaves it. */
function TextField({
  value,
  onCommit,
  title,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  title?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  return (
    <input
      value={draft}
      title={title}
      aria-label={title}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onCommit(draft);
          (event.target as HTMLInputElement).blur();
        }
      }}
      className="w-full min-w-0 border-2 border-edge bg-white px-1.5 py-1 font-mono text-[11.5px] text-ink"
    />
  );
}

function ColourDot({
  colour,
  onPick,
  title,
}: {
  colour: string;
  onPick: (colour: string) => void;
  title: string;
}) {
  return (
    <label
      title={title}
      className="relative block h-6 w-6 shrink-0 cursor-pointer border-2 border-edge"
      style={{ backgroundColor: colour }}
    >
      <input
        type="color"
        value={colour}
        onChange={(event) => onPick(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={title}
      />
    </label>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-[26px] w-[26px] shrink-0 place-items-center border-2 border-edge bg-white text-ink transition-colors ${
        danger ? "hover:bg-alert-tint hover:text-alert" : "hover:bg-bone"
      }`}
    >
      {children}
    </button>
  );
}

export default function ChartDrawer({
  category,
  chart,
  onChange,
  onAdd,
}: ChartDrawerProps) {
  if (!chart) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="text-[12px] leading-relaxed text-ink-soft">
          No chart on the sheet yet. Write one in the source and press Generate,
          or drop a blank one here and set it up with these controls.
        </p>
        {isChart(category) && (
          <SlabButton onClick={onAdd} tone="solid" className="mt-3">
            <Plus size={13} />
            Add a {category} chart
          </SlabButton>
        )}
      </div>
    );
  }

  const { spec } = chart;
  const { options } = spec;
  const palette = effectivePalette(spec);
  const bar = spec.kind === "bar";
  const line = spec.kind === "line";
  const pie = spec.kind === "pie";
  const scatter = spec.kind === "scatter";

  const write = (patch: Partial<ChartSpec>) => onChange({ ...spec, ...patch });
  const set = <K extends keyof ChartSpec["options"]>(
    key: K,
    value: ChartSpec["options"][K],
  ) => write({ options: { ...options, [key]: value } });
  const writeSeries = (index: number, patch: Partial<ChartSeries>) =>
    write({
      series: spec.series.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry,
      ),
    });

  const addCategory = () => {
    const name = `Item ${spec.categories.length + 1}`;
    write({
      categories: [...spec.categories, name],
      series: spec.series.map((entry) => ({ ...entry, values: [...entry.values, 0] })),
    });
  };
  const dropCategory = (index: number) =>
    write({
      categories: spec.categories.filter((_, at) => at !== index),
      series: spec.series.map((entry) => ({
        ...entry,
        values: entry.values.filter((_, at) => at !== index),
      })),
    });
  const addSeries = () =>
    write({
      series: [
        ...spec.series,
        scatter
          ? { label: `Series ${spec.series.length + 1}`, values: [], points: [{ x: 0, y: 0 }] }
          : {
              label: `Series ${spec.series.length + 1}`,
              values: spec.categories.map(() => 0),
            },
      ],
    });
  const dropSeries = (index: number) =>
    write({ series: spec.series.filter((_, at) => at !== index) });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField
          value={spec.title}
          onCommit={(value) => write({ title: value })}
          title="What the chart is called"
        />
      </Field>

      {/* ------------------------------------------------------- the readings */}
      {!scatter && (
        <Field
          label={pie ? "Slices" : "Readings"}
          className="border-b-2 border-edge p-3"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="pb-1 text-left">
                    <Tick>{pie ? "Slice" : "Name"}</Tick>
                  </th>
                  {spec.series.map((entry, index) => (
                    <th key={index} className="pb-1 pl-1.5 text-left">
                      <Tick>{entry.label || `Series ${index + 1}`}</Tick>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {spec.categories.map((name, index) => (
                  <tr key={index}>
                    <td className="py-0.5 pr-1.5">
                      <TextField
                        value={name}
                        title={`Name of reading ${index + 1}`}
                        onCommit={(value) =>
                          write({
                            categories: spec.categories.map((entry, at) =>
                              at === index ? value : entry,
                            ),
                          })
                        }
                      />
                    </td>
                    {spec.series.map((entry, seriesIndex) => (
                      <td key={seriesIndex} className="py-0.5 pl-1.5">
                        <NumberField
                          value={entry.values[index] ?? 0}
                          title={`${entry.label}, ${name}`}
                          width="w-[68px]"
                          onCommit={(value) =>
                            writeSeries(seriesIndex, {
                              values: entry.values.map((held, at) =>
                                at === index ? value : held,
                              ),
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="py-0.5 pl-1.5">
                      <IconButton
                        label={`Remove ${name}`}
                        danger
                        onClick={() => dropCategory(index)}
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SlabButton onClick={addCategory} className="mt-2">
            <Plus size={12} />
            {pie ? "Add a slice" : "Add a reading"}
          </SlabButton>
        </Field>
      )}

      {/* ---------------------------------------------------------- the series */}
      <Field label="Series" className="border-b-2 border-edge p-3">
        <div className="space-y-1.5">
          {spec.series.map((entry, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <ColourDot
                colour={
                  entry.color ??
                  markColor(palette, options, spec.series.length > 1 ? index : 0)
                }
                title={`Colour of ${entry.label}`}
                onPick={(colour) => writeSeries(index, { color: colour })}
              />
              <TextField
                value={entry.label}
                title={`Name of series ${index + 1}`}
                onCommit={(value) => writeSeries(index, { label: value })}
              />
              {scatter && (
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                  {(entry.points ?? []).length} pts
                </span>
              )}
              {spec.series.length > 1 && (
                <IconButton
                  label={`Remove ${entry.label}`}
                  danger
                  onClick={() => dropSeries(index)}
                >
                  <Trash2 size={12} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
        <SlabButton onClick={addSeries} className="mt-2">
          <Plus size={12} />
          Add a series
        </SlabButton>
        {spec.series.some((entry) => entry.color) && (
          <button
            type="button"
            onClick={() =>
              write({
                series: spec.series.map(({ color, ...rest }) => {
                  void color;
                  return rest;
                }),
              })
            }
            className="mt-2 block text-[11px] text-ink underline underline-offset-2"
          >
            Give the colours back to the palette
          </button>
        )}
      </Field>

      {/* ----------------------------------------------------- scatter points */}
      {scatter && (
        <Field label="Points" className="border-b-2 border-edge p-3">
          {spec.series.map((entry, seriesIndex) => (
            <div key={seriesIndex} className="mb-2.5 last:mb-0">
              <Tick className="mb-1 block">{entry.label}</Tick>
              <div className="space-y-1">
                {(entry.points ?? []).map((point, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <NumberField
                      value={point.x}
                      width="w-[58px]"
                      title="Across"
                      onCommit={(value) =>
                        writeSeries(seriesIndex, {
                          points: (entry.points ?? []).map((held, at) =>
                            at === index ? { ...held, x: value } : held,
                          ),
                        })
                      }
                    />
                    <NumberField
                      value={point.y}
                      width="w-[58px]"
                      title="Up"
                      onCommit={(value) =>
                        writeSeries(seriesIndex, {
                          points: (entry.points ?? []).map((held, at) =>
                            at === index ? { ...held, y: value } : held,
                          ),
                        })
                      }
                    />
                    <TextField
                      value={point.label ?? ""}
                      placeholder="name"
                      title="Name beside this point"
                      onCommit={(value) =>
                        writeSeries(seriesIndex, {
                          points: (entry.points ?? []).map((held, at) =>
                            at === index
                              ? value
                                ? { ...held, label: value }
                                : { x: held.x, y: held.y }
                              : held,
                          ),
                        })
                      }
                    />
                    <IconButton
                      label="Remove this point"
                      danger
                      onClick={() =>
                        writeSeries(seriesIndex, {
                          points: (entry.points ?? []).filter((_, at) => at !== index),
                        })
                      }
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                ))}
              </div>
              <SlabButton
                className="mt-1.5"
                onClick={() => {
                  const points = entry.points ?? [];
                  const last = points[points.length - 1] ?? { x: 0, y: 0 };
                  writeSeries(seriesIndex, {
                    points: [...points, { x: round(last.x + 1), y: round(last.y) }],
                  });
                }}
              >
                <Plus size={12} />
                Add a point
              </SlabButton>
            </div>
          ))}
        </Field>
      )}

      {/* ------------------------------------------------------------ the look */}
      {bar && (
        <Field label="Bars" className="border-b-2 border-edge p-3">
          <Segmented
            size="sm"
            value={options.orientation}
            onChange={(value) => set("orientation", value)}
            options={[
              { value: "vertical", label: "Upright" },
              { value: "horizontal", label: "On its side" },
            ]}
          />
          {spec.series.length > 1 && (
            <div className="mt-2">
              <Segmented
                size="sm"
                value={options.layout}
                onChange={(value) => set("layout", value)}
                options={[
                  { value: "grouped", label: "Side by side" },
                  { value: "stacked", label: "Stacked" },
                ]}
              />
            </div>
          )}
        </Field>
      )}

      {line && (
        <Field label="Line" className="border-b-2 border-edge p-3">
          <div className="space-y-2">
            <Segmented
              size="sm"
              value={options.curve ? "curve" : "straight"}
              onChange={(value) => set("curve", value === "curve")}
              options={[
                { value: "straight", label: "Straight" },
                { value: "curve", label: "Curved" },
              ]}
            />
            <Segmented
              size="sm"
              value={options.markers ? "on" : "off"}
              onChange={(value) => set("markers", value === "on")}
              options={[
                { value: "on", label: "Dots on" },
                { value: "off", label: "Dots off" },
              ]}
            />
            <Segmented
              size="sm"
              value={options.area ? "on" : "off"}
              onChange={(value) => set("area", value === "on")}
              options={[
                { value: "off", label: "No wash" },
                { value: "on", label: "Wash under" },
              ]}
            />
          </div>
        </Field>
      )}

      {pie && (
        <Field label="Pie" className="border-b-2 border-edge p-3">
          <Segmented
            size="sm"
            value={options.percent ? "percent" : "value"}
            onChange={(value) => set("percent", value === "percent")}
            options={[
              { value: "percent", label: "Shares" },
              { value: "value", label: "Values" },
            ]}
          />
          <label className="mt-2.5 flex items-center gap-2">
            <span className="shrink-0 font-mono text-[11.5px] text-ink">Hole</span>
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.05}
              value={options.donut}
              onChange={(event) => set("donut", Number(event.target.value))}
              className="h-1 flex-1 accent-edge"
              aria-label="How big a hole is left in the middle"
            />
            <span className="w-9 shrink-0 text-right font-mono text-[11px] text-ink-faint">
              {Math.round(options.donut * 100)}%
            </span>
          </label>
        </Field>
      )}

      {scatter && (
        <Field label="Cloud" className="border-b-2 border-edge p-3">
          <Segmented
            size="sm"
            value={options.trend ? "on" : "off"}
            onChange={(value) => set("trend", value === "on")}
            options={[
              { value: "off", label: "No trend" },
              { value: "on", label: "Trend line" },
            ]}
          />
        </Field>
      )}

      <Field label="Colour" className="border-b-2 border-edge p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {PALETTES.map((entry) => {
            const held = options.palette === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={held}
                title={entry.hint}
                onClick={() => set("palette", entry.id)}
                className={`border-2 border-edge px-2 py-1.5 text-left font-mono text-[11.5px] transition-colors ${
                  held ? "bg-edge text-bone" : "bg-white text-ink hover:bg-bone"
                }`}
              >
                {entry.name}
              </button>
            );
          })}
        </div>
        {(palette === "single" || options.palette === "single") && (
          <div className="mt-2 flex items-center gap-2">
            <ColourDot
              colour={options.color}
              title="The one colour the marks take"
              onPick={(colour) => set("color", colour)}
            />
            <span className="font-mono text-[11px] text-ink-faint">
              Every mark takes this colour.
            </span>
          </div>
        )}
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {CHART_STYLES.map((entry) => {
            const held = options.style === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={held}
                title={entry.hint}
                onClick={() => set("style", entry.id)}
                className={`border-2 border-edge px-2 py-1.5 text-left font-mono text-[11.5px] transition-colors ${
                  held ? "bg-edge text-bone" : "bg-white text-ink hover:bg-bone"
                }`}
              >
                {entry.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="What it shows" className="border-b-2 border-edge p-3">
        <Tick className="mb-1.5 block">Key</Tick>
        <Segmented
          size="sm"
          value={options.legend}
          onChange={(value) => set("legend", value)}
          options={[
            { value: "none", label: "None" },
            { value: "bottom", label: "Under" },
            { value: "right", label: "Beside" },
            { value: "top", label: "Over" },
          ]}
        />
        <Tick className="mb-1.5 mt-3 block">Numbers on the marks</Tick>
        <Segmented
          size="sm"
          value={options.values ? "on" : "off"}
          onChange={(value) => set("values", value === "on")}
          options={[
            { value: "off", label: "Off" },
            { value: "on", label: "On" },
          ]}
        />
        {!pie && (
          <>
            <Tick className="mb-1.5 mt-3 block">Rules behind the marks</Tick>
            <Segmented
              size="sm"
              value={options.grid}
              onChange={(value) => set("grid", value)}
              options={[
                { value: "none", label: "None" },
                { value: "value", label: "Value" },
                { value: "category", label: "Category" },
                { value: "both", label: "Both" },
              ]}
            />
          </>
        )}
      </Field>

      {!pie && (
        <Field label="Axes" className="border-b-2 border-edge p-3">
          <div className="space-y-1.5">
            <TextField
              value={options.xTitle}
              placeholder="caption under the axis"
              title="Caption under the across axis"
              onCommit={(value) => set("xTitle", value)}
            />
            <TextField
              value={options.yTitle}
              placeholder="caption beside the axis"
              title="Caption beside the up axis"
              onCommit={(value) => set("yTitle", value)}
            />
          </div>
          <Tick className="mb-1.5 mt-3 block">Where the value axis runs</Tick>
          {options.min === null || options.max === null ? (
            <SlabButton
              onClick={() => {
                const numbers = spec.series.flatMap((entry) =>
                  scatter ? (entry.points ?? []).map((p) => p.y) : entry.values,
                );
                set("min", 0);
                onChange({
                  ...spec,
                  options: {
                    ...options,
                    min: 0,
                    max: Math.max(1, Math.ceil(Math.max(...numbers, 0))),
                  },
                });
              }}
            >
              Pin it
            </SlabButton>
          ) : (
            <div className="flex items-center gap-1.5">
              <NumberField
                value={options.min}
                width="w-[72px]"
                title="Where the value axis starts"
                onCommit={(value) => set("min", value)}
              />
              <NumberField
                value={options.max}
                width="w-[72px]"
                title="Where the value axis stops"
                onCommit={(value) => set("max", value)}
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ ...spec, options: { ...options, min: null, max: null } })
                }
                className="text-[11px] text-ink underline underline-offset-2"
              >
                Work it out
              </button>
            </div>
          )}
        </Field>
      )}

      <Field label="Size" className="p-3">
        <div className="flex items-center gap-1.5">
          <NumberField
            value={options.width}
            width="w-[72px]"
            title="How wide the chart is drawn"
            onCommit={(value) => set("width", Math.max(160, Math.min(2400, value)))}
          />
          <span className="font-mono text-[11px] text-ink-faint">×</span>
          <NumberField
            value={options.height}
            width="w-[72px]"
            title="How tall the chart is drawn"
            onCommit={(value) => set("height", Math.max(120, Math.min(2400, value)))}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          The chart can also be dragged to size on the sheet; it is drawn again
          at whatever size it is let go of.
        </p>
      </Field>
    </div>
  );
}

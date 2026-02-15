// charts.ts — Chart components for zone and traffic analysis
//
// Usage:
//   import { createActivityTimeline, createActivityArea, createSpeedProfile } from "../components/charts.js";

import * as Plot from "npm:@observablehq/plot";
import * as htl from "npm:htl";
import { formatDateTime } from "../utils/format.js";

export interface TrackPoint {
  track_id: string;
  object_type: string;
  device_id: string;
  longitude: number;
  latitude: number;
  timestamp: string;
  speed: number;
  heading: number;
  zones_hit: string[];
}

export interface HeatmapCell {
  lon: number;
  lat: number;
  object_type: string;
  device_id: string;
  point_count: number;
  avg_speed: number;
  max_speed: number;
  first_seen: string;
  last_seen: string;
}

export interface TimelineBin {
  bin_start: string;
  object_type: string;
  count: number;
}

export interface SpeedProfileRow {
  track_id: string;
  object_type: string;
  avg_speed: number;
}

const TYPE_COLORS: Record<string, string> = {
  pedestrian: "#8b5cf6",
  vehicle: "#f59e0b",
};

const THEME = {
  style: { background: "transparent", color: "currentColor" },
};

const BIN_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Activity timeline — 5-minute binned bar chart, stacked by object_type.
 * Accepts pre-binned TimelineBin[] data.
 */
export function createActivityTimeline(
  bins: TimelineBin[],
  { width }: { width?: number } = {},
): SVGSVGElement | HTMLElement {
  const data = bins.map((d) => ({
    bin_start: new Date(d.bin_start),
    bin_end: new Date(new Date(d.bin_start).getTime() + BIN_MS),
    object_type: d.object_type,
    count: d.count,
  }));

  return Plot.plot({
    ...THEME,
    width,
    height: 260,
    marginLeft: 50,
    marginRight: 20,
    x: { label: "Time", type: "time" },
    y: { label: "Detections", grid: true },
    color: {
      domain: ["pedestrian", "vehicle"],
      range: [TYPE_COLORS.pedestrian, TYPE_COLORS.vehicle],
      legend: true,
    },
    marks: [
      Plot.rectY(data, {
        x1: "bin_start",
        x2: "bin_end",
        y: "count",
        fill: "object_type",
        title: (d: any) =>
          `${formatDateTime(d.bin_start)}\n${d.object_type}: ${d.count.toLocaleString()} detections`,
        tip: true,
      }),
      Plot.ruleY([0]),
    ],
  });
}

/**
 * Speed profile — dot strip + box plot of per-track average speed, grouped by object_type.
 * Accepts pre-aggregated SpeedProfileRow[] data (one row per track).
 */
export function createSpeedProfile(
  data: SpeedProfileRow[],
  { width }: { width?: number } = {},
): SVGSVGElement | HTMLElement {
  return Plot.plot({
    ...THEME,
    width,
    height: 340,
    marginLeft: 80,
    marginRight: 20,
    x: { label: "Speed (mph)", grid: true },
    y: { label: null, padding: 0.5 },
    color: {
      domain: ["pedestrian", "vehicle"],
      range: [TYPE_COLORS.pedestrian, TYPE_COLORS.vehicle],
      legend: true,
    },
    marks: [
      Plot.dot(data, {
        x: "avg_speed",
        y: "object_type",
        fill: "object_type",
        fillOpacity: 0.3,
        r: 10,
        tip: true,
      }),
      Plot.boxX(data, {
        x: "avg_speed",
        y: "object_type",
        fill: "object_type",
        fillOpacity: 0.15,
        stroke: "object_type",
        strokeWidth: 1.5,
      }),
    ],
  });
}

/**
 * Activity area — gradient area chart variant of the activity timeline.
 * Accepts pre-binned TimelineBin[] data.
 */
export function createActivityArea(
  bins: TimelineBin[],
  { width }: { width?: number } = {},
): SVGSVGElement | HTMLElement {
  const pedData = bins
    .filter((d) => d.object_type === "pedestrian")
    .map((d) => ({ bin_start: new Date(d.bin_start), count: d.count }));
  const vehData = bins
    .filter((d) => d.object_type === "vehicle")
    .map((d) => ({ bin_start: new Date(d.bin_start), count: d.count }));

  return Plot.plot({
    ...THEME,
    width,
    height: 260,
    marginLeft: 50,
    marginRight: 20,
    x: { label: "Time", type: "time" },
    y: { label: "Detections", grid: true },
    color: {
      domain: ["pedestrian", "vehicle"],
      range: [TYPE_COLORS.pedestrian, TYPE_COLORS.vehicle],
      legend: true,
    },
    marks: [
      () => htl.svg`<defs>
        <linearGradient id="ped-grad" gradientTransform="rotate(90)">
          <stop offset="5%" stop-color="${TYPE_COLORS.pedestrian}" stop-opacity="0.6" />
          <stop offset="100%" stop-color="${TYPE_COLORS.pedestrian}" stop-opacity="0.05" />
        </linearGradient>
        <linearGradient id="veh-grad" gradientTransform="rotate(90)">
          <stop offset="5%" stop-color="${TYPE_COLORS.vehicle}" stop-opacity="0.6" />
          <stop offset="100%" stop-color="${TYPE_COLORS.vehicle}" stop-opacity="0.05" />
        </linearGradient>
      </defs>`,
      Plot.areaY(pedData, {
        x: "bin_start",
        y: "count",
        fill: "url(#ped-grad)",
        curve: "basis",
      }),
      Plot.areaY(vehData, {
        x: "bin_start",
        y: "count",
        fill: "url(#veh-grad)",
        curve: "basis",
      }),
      Plot.lineY(pedData, {
        x: "bin_start",
        y: "count",
        stroke: TYPE_COLORS.pedestrian,
        strokeWidth: 2,
        curve: "basis",
        title: (d: any) =>
          `${formatDateTime(d.bin_start)}\npedestrian: ${d.count.toLocaleString()} detections`,
        tip: true,
      }),
      Plot.lineY(vehData, {
        x: "bin_start",
        y: "count",
        stroke: TYPE_COLORS.vehicle,
        strokeWidth: 2,
        curve: "basis",
        title: (d: any) =>
          `${formatDateTime(d.bin_start)}\nvehicle: ${d.count.toLocaleString()} detections`,
        tip: true,
      }),
      Plot.ruleY([0]),
    ],
  });
}

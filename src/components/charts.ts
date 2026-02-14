// charts.ts — Chart components for zone and traffic analysis
//
// Usage:
//   import { createActivityTimeline, createActivityArea, createSpeedProfile } from "../components/charts.js";

import * as Plot from "npm:@observablehq/plot";
import * as htl from "npm:htl";

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

const TYPE_COLORS: Record<string, string> = {
  pedestrian: "#8b5cf6",
  vehicle: "#f59e0b",
};

const THEME = {
  style: { background: "transparent", color: "currentColor" },
};

/**
 * Activity timeline — 5-minute binned bar chart, stacked by object_type.
 */
export function createActivityTimeline(
  tracks: TrackPoint[],
  { width }: { width?: number } = {},
): SVGSVGElement | HTMLElement {
  const data = tracks.map((d) => ({
    ...d,
    timestamp: new Date(d.timestamp),
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
      Plot.rectY(
        data,
        {
          ...Plot.binX(
            { y: "count" },
            {
              x: "timestamp",
              fill: "object_type",
              interval: "5 minutes",
            },
          ),
          tip: true,
        },
      ),
      Plot.ruleY([0]),
    ],
  });
}

/**
 * Speed profile — dot strip + box plot of per-track average speed, grouped by object_type.
 */
export function createSpeedProfile(
  tracks: TrackPoint[],
  { width }: { width?: number } = {},
): SVGSVGElement | HTMLElement {
  // Group by track_id, compute avg speed per track
  const trackMap = new Map<string, { type: string; speeds: number[] }>();
  for (const t of tracks) {
    if (!trackMap.has(t.track_id))
      trackMap.set(t.track_id, { type: t.object_type, speeds: [] });
    trackMap.get(t.track_id)!.speeds.push(t.speed);
  }
  const data = Array.from(trackMap, ([, v]) => ({
    object_type: v.type,
    avg_speed: v.speeds.reduce((a, b) => a + b, 0) / v.speeds.length,
  }));

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
 */
export function createActivityArea(
  tracks: TrackPoint[],
  { width }: { width?: number } = {},
): SVGSVGElement | HTMLElement {
  const data = tracks.map((d) => ({
    ...d,
    timestamp: new Date(d.timestamp),
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
      Plot.areaY(
        data.filter((d) => d.object_type === "pedestrian"),
        Plot.binX(
          { y: "count" },
          {
            x: "timestamp",
            fill: "url(#ped-grad)",
            interval: "5 minutes",
            curve: "basis",
          },
        ),
      ),
      Plot.areaY(
        data.filter((d) => d.object_type === "vehicle"),
        Plot.binX(
          { y: "count" },
          {
            x: "timestamp",
            fill: "url(#veh-grad)",
            interval: "5 minutes",
            curve: "basis",
          },
        ),
      ),
      Plot.lineY(
        data.filter((d) => d.object_type === "pedestrian"),
        {
          ...Plot.binX(
            { y: "count" },
            {
              x: "timestamp",
              interval: "5 minutes",
              curve: "basis",
            },
          ),
          stroke: TYPE_COLORS.pedestrian,
          strokeWidth: 2,
          tip: true,
        },
      ),
      Plot.lineY(
        data.filter((d) => d.object_type === "vehicle"),
        {
          ...Plot.binX(
            { y: "count" },
            {
              x: "timestamp",
              interval: "5 minutes",
              curve: "basis",
            },
          ),
          stroke: TYPE_COLORS.vehicle,
          strokeWidth: 2,
          tip: true,
        },
      ),
      Plot.ruleY([0]),
    ],
  });
}

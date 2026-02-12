// charts.js — Chart components for zone and traffic analysis
//
// Usage:
//   import { createActivityTimeline, createSpeedDistribution, createDirectionBreakdown } from "../components/charts.js";

import * as Plot from "npm:@observablehq/plot";

const TYPE_COLORS = {pedestrian: "#f59e0b", vehicle: "#8b5cf6"};
const DIRECTION_ORDER = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const DARK_THEME = {
  style: {background: "transparent", color: "#e0e0e0"},
  marginLeft: 50,
};

/**
 * Activity timeline — 5-minute binned bar chart, stacked by object_type.
 * @param {Array} tracks - Track points [{ timestamp, object_type, ... }]
 * @param {Object} options
 * @param {number} [options.width] - Chart width
 * @returns {SVGElement}
 */
export function createActivityTimeline(tracks, {width} = {}) {
  const data = tracks.map((d) => ({
    ...d,
    timestamp: new Date(d.timestamp),
  }));

  return Plot.plot({
    ...DARK_THEME,
    width,
    height: 260,
    x: {label: "Time", type: "time"},
    y: {label: "Detections", grid: true},
    color: {domain: ["pedestrian", "vehicle"], range: [TYPE_COLORS.pedestrian, TYPE_COLORS.vehicle], legend: true},
    marks: [
      Plot.rectY(
        data,
        Plot.binX(
          {y: "count"},
          {
            x: "timestamp",
            fill: "object_type",
            interval: "5 minutes",
          },
        ),
      ),
      Plot.ruleY([0]),
    ],
  });
}

/**
 * Speed distribution — histogram of avg_speed, faceted by object_type.
 * @param {Array} heatmapData - Heatmap cells [{ avg_speed, object_type, ... }]
 * @param {Object} options
 * @param {number} [options.width] - Chart width
 * @returns {SVGElement}
 */
export function createSpeedDistribution(heatmapData, {width} = {}) {
  return Plot.plot({
    ...DARK_THEME,
    width,
    height: 260,
    x: {label: "Avg Speed (km/h)"},
    y: {label: "Count", grid: true},
    fy: {label: "Type"},
    color: {domain: ["pedestrian", "vehicle"], range: [TYPE_COLORS.pedestrian, TYPE_COLORS.vehicle]},
    marks: [
      Plot.rectY(
        heatmapData,
        Plot.binX(
          {y: "count"},
          {
            x: "avg_speed",
            fill: "object_type",
            fy: "object_type",
            thresholds: 15,
          },
        ),
      ),
      Plot.ruleY([0]),
    ],
  });
}

/**
 * Direction breakdown — horizontal bar chart of compass direction counts.
 * @param {Object} summary - Summary JSON with .directions { N, NE, E, ... }
 * @param {Object} options
 * @param {number} [options.width] - Chart width
 * @returns {SVGElement}
 */
export function createDirectionBreakdown(summary, {width} = {}) {
  const data = DIRECTION_ORDER.map((dir) => ({
    direction: dir,
    count: summary.directions[dir] || 0,
  }));

  return Plot.plot({
    ...DARK_THEME,
    width,
    height: 260,
    x: {label: "Count", grid: true},
    y: {label: null, domain: DIRECTION_ORDER},
    color: {scheme: "warm"},
    marks: [
      Plot.barX(data, {
        x: "count",
        y: "direction",
        fill: "count",
        sort: {y: null},
      }),
      Plot.ruleX([0]),
    ],
  });
}

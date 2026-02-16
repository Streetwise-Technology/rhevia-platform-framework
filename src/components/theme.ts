// theme.ts — Shared color constants for Rhevia brand
//
// Usage in .md pages:
//   import { BRAND_COLORS, HEX_COLOR_RANGE } from "../components/theme.js";

// ── Brand colors (hex strings for Plot / SVG / CSS) ─────────────

export const BRAND_COLORS = {
  pedestrian: "#8b5cf6",
  vehicle: "#f59e0b",
  accent: "#f472b6",
} as const;

// ── Brand colors (RGB arrays for deck.gl) ───────────────────────

export const PEDESTRIAN_RGB: [number, number, number] = [139, 92, 246];
export const VEHICLE_RGB: [number, number, number] = [245, 158, 11];

// ── Hexagon density gradients (per-type, 5 stops) ───────────────

export const HEX_COLOR_RANGES: Record<string, [number, number, number][]> = {
  all: [
    [237, 233, 254], // #ede9fe lightest purple
    [196, 181, 253], // #c4b5fd
    [139, 92, 246], // #8b5cf6 core purple
    [245, 158, 11], // #f59e0b core amber
    [146, 64, 14], // #92400e deep amber
  ],
  pedestrian: [
    [237, 233, 254], // #ede9fe
    [196, 181, 253], // #c4b5fd
    [167, 139, 250], // #a78bfa
    [139, 92, 246], // #8b5cf6
    [91, 33, 182], // #5b21b6
  ],
  vehicle: [
    [254, 243, 199], // #fef3c7
    [252, 211, 77], // #fcd34d
    [245, 158, 11], // #f59e0b
    [217, 119, 6], // #d97706
    [146, 64, 14], // #92400e
  ],
};

// ── Direction rose gradient ranges (5-stop, hex) ────────────────

export const ROSE_COLOR_RANGES = {
  pedestrian: ["#ede9fe", "#c4b5fd", "#8b5cf6", "#7c3aed", "#5b21b6"],
  vehicle: ["#fef3c7", "#fcd34d", "#f59e0b", "#d97706", "#92400e"],
  combined: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
} as const;

// ── Zone layer styling ──────────────────────────────────────────

export const ZONE_LINE_COLOR: [number, number, number, number] = [56, 189, 193, 100];
export const ZONE_FILL_COLOR: [number, number, number, number] = [56, 189, 193, 38];
export const SUBZONE_LINE_COLOR: [number, number, number, number] = [245, 158, 11, 100];
export const SUBZONE_FILL_COLOR: [number, number, number, number] = [245, 158, 11, 38];

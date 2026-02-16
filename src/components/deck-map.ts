// deck-map.ts — Reusable deck.gl + Mapbox movement map component
//
// Usage in .md pages:
//   import {createMovementMap} from "../components/deck-map.js";
//   const deckMap = createMovementMap({heatmap, tracks, mapboxToken});

import type { HeatmapCell, TrackPoint, TimelineBin } from "./charts.js";
import {
  BRAND_COLORS,
  PEDESTRIAN_RGB,
  VEHICLE_RGB,
  HEX_COLOR_RANGES,
  ZONE_FILL_COLOR,
  ZONE_LINE_COLOR,
  SUBZONE_FILL_COLOR,
  SUBZONE_LINE_COLOR,
} from "./theme.js";
import * as d3 from "npm:d3";
import deck from "npm:deck.gl";
import mapboxgl from "npm:mapbox-gl";

const { MapboxOverlay, TripsLayer } = deck;

const MAP_STYLES = new Map([
  ["Standard", "mapbox://styles/mapbox/standard"],
  ["Satellite", "mapbox://styles/mapbox/satellite-streets-v12"],
  ["Dark", "mapbox://styles/mapbox/dark-v11"],
]);

const LIGHT_PRESETS = ["dawn", "day", "dusk", "night"] as const;
type LightPreset = (typeof LIGHT_PRESETS)[number];
const DEFAULT_LIGHT_PRESET: LightPreset = "dusk";

// ── Types ────────────────────────────────────────────────────────

interface ZoneFeature {
  type: "Feature";
  geometry: any;
  properties: {
    feature_id: string;
    feature_name: string;
    feature_type: string;
    metadata: Record<string, any>;
  };
}

export interface ZoneFeatureCollection {
  type: "FeatureCollection";
  features: ZoneFeature[];
}

export interface MovementMapData {
  heatmap: HeatmapCell[];
  tracks: TrackPoint[];
  mapboxToken: string;
  zones?: ZoneFeatureCollection;
  timeline?: TimelineBin[];
}

export interface MovementMapHandle {
  container: HTMLDivElement;
  map: mapboxgl.Map;
  overlay: InstanceType<typeof MapboxOverlay>;
  scrubberForm: HTMLFormElement;
  layerCheckbox: HTMLElement;
  hexSlider: HTMLElement;
  hexWidthSlider: HTMLElement;
  styleRadio: HTMLElement;
  lightPresetForm: HTMLFormElement;
  lightPillsContainer: HTMLDivElement;
  currentStyle: string;
  timeMin: number;
  timeRange: number;
  updateHistogram(bins: TimelineBin[], typeFilter: string): void;
  buildLayers(opts: {
    layerVisibility: string[];
    currentTime: number;
    hexElevation: number;
    hexRadius: number;
    heatmap?: HeatmapCell[];
    trips?: Trip[];
    typeFilter?: string;
  }): unknown[];
}

// ── Histogram ────────────────────────────────────────────────────

const HISTOGRAM_HEIGHT = 28;

function drawHistogram(
  canvas: HTMLCanvasElement,
  bins: TimelineBin[],
  timeMin: number,
  timeRange: number,
  typeFilter: string,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = HISTOGRAM_HEIGHT;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (bins.length === 0 || timeRange <= 0 || cssWidth <= 0) return;

  const numColumns = Math.max(1, Math.floor(cssWidth / 3));
  const colDuration = timeRange / numColumns;

  const pedCounts = new Float64Array(numColumns);
  const vehCounts = new Float64Array(numColumns);

  for (const bin of bins) {
    const binTime = new Date(bin.bin_start).getTime() - timeMin;
    const colIdx = Math.floor(binTime / colDuration);
    if (colIdx < 0 || colIdx >= numColumns) continue;
    if (bin.object_type === "pedestrian") {
      pedCounts[colIdx] += bin.count;
    } else {
      vehCounts[colIdx] += bin.count;
    }
  }

  let maxCount = 0;
  for (let i = 0; i < numColumns; i++) {
    const total = pedCounts[i] + vehCounts[i];
    if (total > maxCount) maxCount = total;
  }
  if (maxCount === 0) return;

  const barWidth = Math.max(1, cssWidth / numColumns - 1);
  const barGap = Math.max(0, cssWidth / numColumns - barWidth);

  // Determine stacking order for "All" — minority type on top so it's visible
  let totalPed = 0,
    totalVeh = 0;
  for (let j = 0; j < numColumns; j++) {
    totalPed += pedCounts[j];
    totalVeh += vehCounts[j];
  }
  const pedOnTop = totalPed <= totalVeh;

  for (let i = 0; i < numColumns; i++) {
    const x = i * (barWidth + barGap);
    const pedH = (pedCounts[i] / maxCount) * cssHeight;
    const vehH = (vehCounts[i] / maxCount) * cssHeight;

    if (typeFilter === "All") {
      const bottomH = pedOnTop ? vehH : pedH;
      const topH = pedOnTop ? pedH : vehH;
      if (bottomH > 0) {
        ctx.fillStyle = pedOnTop
          ? BRAND_COLORS.vehicle
          : BRAND_COLORS.pedestrian;
        ctx.fillRect(x, cssHeight - bottomH, barWidth, bottomH);
      }
      if (topH > 0) {
        const visibleTopH = Math.max(2, topH);
        ctx.fillStyle = pedOnTop
          ? BRAND_COLORS.pedestrian
          : BRAND_COLORS.vehicle;
        ctx.fillRect(
          x,
          cssHeight - bottomH - visibleTopH,
          barWidth,
          visibleTopH,
        );
      }
    } else if (typeFilter === "Pedestrian") {
      if (pedH > 0) {
        ctx.fillStyle = BRAND_COLORS.pedestrian;
        ctx.fillRect(x, cssHeight - pedH, barWidth, pedH);
      }
    } else {
      if (vehH > 0) {
        ctx.fillStyle = BRAND_COLORS.vehicle;
        ctx.fillRect(x, cssHeight - vehH, barWidth, vehH);
      }
    }
  }
}

// ── Scrubber ─────────────────────────────────────────────────────

function createScrubber(
  min: number,
  max: number,
  {
    step = 1,
    delay = 50,
    loop = true,
    autoplay = false,
    format = String,
    speeds = [0.5, 1, 10, 30, 60],
    timeMin = 0,
    timeline = [] as TimelineBin[],
    typeFilter = "All",
  }: {
    step?: number;
    delay?: number;
    loop?: boolean;
    autoplay?: boolean;
    format?: (v: number) => string;
    speeds?: number[];
    timeMin?: number;
    timeline?: TimelineBin[];
    typeFilter?: string;
  } = {},
): {
  form: HTMLFormElement;
  updateHistogram: (bins: TimelineBin[], typeFilter: string) => void;
} {
  const form = document.createElement("form");
  Object.assign(form.style, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    font: "13px var(--sans-serif)",
  });

  // Histogram row — aligned with slider via matching spacers
  const histogramRow = document.createElement("div");
  Object.assign(histogramRow.style, {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
  });

  const histLeftSpacer = document.createElement("div");
  Object.assign(histLeftSpacer.style, { width: "32px", flexShrink: "0" });

  const histCanvas = document.createElement("canvas");
  Object.assign(histCanvas.style, {
    flex: "1",
    height: `${HISTOGRAM_HEIGHT}px`,
    display: "block",
    borderRadius: "2px",
  });

  const histRightSpacer = document.createElement("div");
  Object.assign(histRightSpacer.style, { minWidth: "90px", flexShrink: "0" });

  histogramRow.appendChild(histLeftSpacer);
  histogramRow.appendChild(histCanvas);
  histogramRow.appendChild(histRightSpacer);
  form.appendChild(histogramRow);

  // Playback row
  const playbackRow = document.createElement("div");
  Object.assign(playbackRow.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  });

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "\u25B6";
  Object.assign(btn.style, {
    width: "32px",
    height: "32px",
    border: "none",
    borderRadius: "4px",
    background: "#334155",
    color: "white",
    cursor: "pointer",
    fontSize: "14px",
  });

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(min);
  Object.assign(slider.style, { flex: "1", accentColor: "#f59e0b" });

  const output = document.createElement("output");
  output.textContent = format(min);
  Object.assign(output.style, {
    minWidth: "90px",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    color: "#e0e0e0",
  });

  // Speed multiplier buttons
  const speedGroup = document.createElement("div");
  Object.assign(speedGroup.style, {
    display: "flex",
    gap: "2px",
    justifyContent: "flex-start",
  });

  const SPEEDS = speeds;
  let currentStep = step;

  const speedBtns = SPEEDS.map((mult) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${mult}x`;
    Object.assign(b.style, {
      padding: "2px 6px",
      border: "1px solid #555",
      borderRadius: "3px",
      background: mult === 1 ? "#f59e0b" : "#334155",
      color: mult === 1 ? "#000" : "#e0e0e0",
      cursor: "pointer",
      fontSize: "11px",
      fontWeight: "600",
      lineHeight: "1.2",
    });
    b.onclick = () => {
      currentStep = step * mult;
      speedBtns.forEach((sb, i) => {
        sb.style.background = SPEEDS[i] === mult ? "#f59e0b" : "#334155";
        sb.style.color = SPEEDS[i] === mult ? "#000" : "#e0e0e0";
      });
    };
    speedGroup.appendChild(b);
    return b;
  });

  playbackRow.appendChild(btn);
  playbackRow.appendChild(slider);
  playbackRow.appendChild(output);
  form.appendChild(playbackRow);

  // Start / end time labels below the slider
  const timeRangeRow = document.createElement("div");
  Object.assign(timeRangeRow.style, {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "11px",
    color: "#9ca3af",
    paddingLeft: "40px",
  });
  const startLabel = document.createElement("span");
  startLabel.textContent = format(min);
  const endLabel = document.createElement("span");
  endLabel.textContent = format(max);
  timeRangeRow.appendChild(startLabel);
  timeRangeRow.appendChild(endLabel);
  form.appendChild(timeRangeRow);

  form.appendChild(speedGroup);

  // Histogram drawing state
  let currentBins = timeline;
  let currentTypeFilter = typeFilter;
  const timeRange = max - min;

  function redrawHistogram() {
    drawHistogram(
      histCanvas,
      currentBins,
      timeMin,
      timeRange,
      currentTypeFilter,
    );
  }

  new ResizeObserver(() => redrawHistogram()).observe(histCanvas);

  function updateHistogram(bins: TimelineBin[], tf: string) {
    currentBins = bins;
    currentTypeFilter = tf;
    redrawHistogram();
  }

  // Playback logic
  let timer: ReturnType<typeof setInterval> | null = null;
  let value = min;

  function update() {
    slider.value = String(value);
    output.textContent = format(value);
    (form as any).value = value;
    form.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    btn.textContent = "\u25B6";
  }

  function tick() {
    value += currentStep;
    if (value > max) {
      if (loop) value = min;
      else {
        stop();
        return;
      }
    }
    update();
  }

  btn.onclick = () => {
    if (timer) {
      stop();
    } else {
      if (value >= max) value = min;
      btn.textContent = "\u23F8";
      timer = setInterval(tick, delay);
    }
  };

  slider.oninput = () => {
    value = +slider.value;
    output.textContent = format(value);
    (form as any).value = value;
  };

  (form as any).value = value;
  if (autoplay) btn.click();

  return { form, updateHistogram };
}

// ── Hex Slider ──────────────────────────────────────────────────

function createLabeledSlider(
  labelText: string,
  min: number,
  max: number,
  { step = 0.01, value = 0.2 }: { step?: number; value?: number } = {},
): HTMLFormElement {
  const form = document.createElement("form");
  Object.assign(form.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    font: "13px var(--sans-serif)",
  });

  const label = document.createElement("label");
  label.textContent = labelText;
  Object.assign(label.style, { color: "#e0e0e0", whiteSpace: "nowrap" });

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  Object.assign(slider.style, { flex: "1", accentColor: "#f59e0b" });

  form.appendChild(label);
  form.appendChild(slider);

  (form as any).value = value;

  slider.oninput = () => {
    (form as any).value = +slider.value;
    form.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return form;
}

// ── Pill helpers ────────────────────────────────────────────────

const PILL_STYLE_ACTIVE = {
  background: "var(--theme-foreground)",
  color: "var(--theme-background)",
};

const PILL_STYLE_INACTIVE = {
  background: "transparent",
  color: "var(--theme-foreground)",
};

function pillBase(label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  Object.assign(btn.style, {
    padding: "4px 14px",
    borderRadius: "999px",
    border: "1px solid var(--theme-foreground-faintest)",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
    ...PILL_STYLE_INACTIVE,
  });
  return btn;
}

function applyPillState(btn: HTMLButtonElement, active: boolean) {
  Object.assign(btn.style, active ? PILL_STYLE_ACTIVE : PILL_STYLE_INACTIVE);
}

function createMultiSelectPills(
  options: string[],
  { value: defaultValues = [] as string[], label = "" } = {},
): HTMLFormElement {
  const form = document.createElement("form");
  const selected = new Set(defaultValues);
  (form as any).value = [...selected];

  if (label) {
    const heading = document.createElement("div");
    heading.textContent = label;
    Object.assign(heading.style, {
      color: "#e0e0e0",
      fontSize: "12px",
      fontWeight: "600",
      marginBottom: "4px",
    });
    form.appendChild(heading);
  }

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  });

  const buttons = options.map((opt) => {
    const btn = pillBase(opt);
    applyPillState(btn, selected.has(opt));
    btn.onclick = () => {
      if (selected.has(opt)) selected.delete(opt);
      else selected.add(opt);
      (form as any).value = [...selected];
      buttons.forEach((b, i) => applyPillState(b, selected.has(options[i])));
      form.dispatchEvent(new Event("input", { bubbles: true }));
    };
    wrapper.appendChild(btn);
    return btn;
  });

  form.appendChild(wrapper);
  return form;
}

function createSingleSelectPills(
  entries: Map<string, string>,
  { value: defaultValue = "" } = {},
): HTMLFormElement {
  const form = document.createElement("form");
  (form as any).value = defaultValue;

  const heading = document.createElement("div");
  heading.textContent = "Style";
  Object.assign(heading.style, {
    color: "#e0e0e0",
    fontSize: "12px",
    fontWeight: "600",
    marginBottom: "4px",
  });
  form.appendChild(heading);

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  });

  const buttons: HTMLButtonElement[] = [];
  for (const [label, val] of entries) {
    const btn = pillBase(label);
    applyPillState(btn, val === defaultValue);
    btn.onclick = () => {
      (form as any).value = val;
      buttons.forEach((b) => applyPillState(b, b === btn));
      form.dispatchEvent(new Event("input", { bubbles: true }));
    };
    wrapper.appendChild(btn);
    buttons.push(btn);
  }

  form.appendChild(wrapper);
  return form;
}

// ── Light preset pills ──────────────────────────────────────────

function createLightPresetPills(defaultPreset: LightPreset): HTMLFormElement {
  const form = document.createElement("form");
  (form as any).value = defaultPreset;

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "flex",
    gap: "6px",
    padding: "6px 8px",
  });

  const buttons = LIGHT_PRESETS.map((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = preset.charAt(0).toUpperCase() + preset.slice(1);
    btn.dataset.preset = preset;

    const isActive = preset === defaultPreset;
    Object.assign(btn.style, {
      padding: "4px 14px",
      borderRadius: "999px",
      border: "1px solid var(--theme-foreground-faintest)",
      background: isActive ? "var(--theme-foreground)" : "transparent",
      color: isActive ? "var(--theme-background)" : "var(--theme-foreground)",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "500",
    });

    btn.onclick = () => {
      (form as any).value = preset;
      form.dispatchEvent(new Event("input", { bubbles: true }));
    };

    wrapper.appendChild(btn);
    return btn;
  });

  form.addEventListener("input", () => {
    const current = (form as any).value;
    buttons.forEach((btn) => {
      const active = btn.dataset.preset === current;
      btn.style.background = active ? "var(--theme-foreground)" : "transparent";
      btn.style.color = active
        ? "var(--theme-background)"
        : "var(--theme-foreground)";
    });
  });

  form.appendChild(wrapper);
  return form;
}

// ── Trip preprocessing ───────────────────────────────────────────

export interface Trip {
  trackId: string;
  objectType: string;
  coordinates: [number, number][];
  timestamps: number[];
  speeds: number[];
}

export function preprocessTrips(
  tracks: TrackPoint[],
  timeOffset: number = 0,
): Trip[] {
  const trackGroups = d3.group(tracks, (d: TrackPoint) => d.track_id);
  return Array.from(trackGroups, ([trackId, points]) => {
    const sorted = [...points].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return {
      trackId,
      objectType: sorted[0].object_type,
      coordinates: sorted.map(
        (p) => [p.longitude, p.latitude] as [number, number],
      ),
      timestamps: sorted.map(
        (p) => new Date(p.timestamp).getTime() - timeOffset,
      ),
      speeds: sorted.map((p) => p.speed ?? 0),
    };
  });
}

// ── Trip head interpolation ──────────────────────────────────────

interface TripHeadDatum {
  position: [number, number];
  trackId: string;
  objectType: string;
  speed: number;
  color: [number, number, number];
}

function interpolateTripHeads(
  trips: Trip[],
  currentTime: number,
  layerVisible: boolean,
): TripHeadDatum[] {
  if (!layerVisible) return [];
  const heads: TripHeadDatum[] = [];

  for (const trip of trips) {
    const ts = trip.timestamps;
    const len = ts.length;
    if (len === 0) continue;
    if (currentTime < ts[0] || currentTime > ts[len - 1]) continue;

    // Binary search: find rightmost index where ts[i] <= currentTime
    let lo = 0;
    let hi = len - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ts[mid] <= currentTime) lo = mid;
      else hi = mid - 1;
    }
    const i = lo;
    const color =
      trip.objectType === "pedestrian" ? PEDESTRIAN_RGB : VEHICLE_RGB;

    if (i >= len - 1 || ts[i] === currentTime) {
      heads.push({
        position: trip.coordinates[i],
        trackId: trip.trackId,
        objectType: trip.objectType,
        speed: trip.speeds[i],
        color,
      });
      continue;
    }

    // Linear interpolation between points i and i+1
    const frac = (currentTime - ts[i]) / (ts[i + 1] - ts[i]);
    const [lon0, lat0] = trip.coordinates[i];
    const [lon1, lat1] = trip.coordinates[i + 1];

    heads.push({
      position: [lon0 + (lon1 - lon0) * frac, lat0 + (lat1 - lat0) * frac],
      trackId: trip.trackId,
      objectType: trip.objectType,
      speed: trip.speeds[i] + (trip.speeds[i + 1] - trip.speeds[i]) * frac,
      color,
    });
  }

  return heads;
}

// ── Factory ──────────────────────────────────────────────────────

export function createMovementMap(data: MovementMapData): MovementMapHandle {
  const { heatmap, tracks, mapboxToken: mapboxTokenProp, zones } = data;
  const mapboxToken =
    mapboxTokenProp ||
    (typeof window !== "undefined" && (window as any).__MAPBOX_TOKEN) ||
    undefined;
  if (!mapboxToken) throw new Error("No Mapbox token provided");

  // ── Compute geometry ───────────────────────────────────────────

  const lons = heatmap.map((d) => d.lon);
  const lats = heatmap.map((d) => d.lat);
  const bounds = {
    min_lon: Math.min(...lons),
    max_lon: Math.max(...lons),
    min_lat: Math.min(...lats),
    max_lat: Math.max(...lats),
  };

  const timestamps = tracks.map((d) => new Date(d.timestamp).getTime());
  const timeMin = Math.min(...timestamps);
  const timeMax = Math.max(...timestamps);
  const timeRange = timeMax - timeMin;

  const trips = preprocessTrips(tracks, timeMin);

  // ── Zone data ───────────────────────────────────────────────────

  const hasZones = !!(zones && zones.features && zones.features.length > 0);
  const zonePolygons = hasZones
    ? zones!.features.filter((f) => f.properties.feature_type === "zone")
    : [];
  const subZonePolygons = hasZones
    ? zones!.features.filter((f) => f.properties.feature_type === "subzone")
    : [];

  // ── Create Observable Inputs ───────────────────────────────────

  const layerOptions = ["Density Hexagons", "Track Playback"];
  if (hasZones) layerOptions.push("Zones");

  const layerCheckbox = createMultiSelectPills(layerOptions, {
    value: hasZones ? ["Zones"] : [],
    label: "Layers",
  });

  const hexSlider = createLabeledSlider("Hexagon height", 0, 10, {
    step: 0.2,
    value: 0.2,
  });
  const hexWidthSlider = createLabeledSlider("Hexagon width", 5, 50, {
    step: 5,
    value: 10,
  });

  const styleRadio = createSingleSelectPills(MAP_STYLES, {
    value: "mapbox://styles/mapbox/standard",
  });

  const { form: scrubberForm, updateHistogram } = createScrubber(0, timeRange, {
    step: 5000,
    delay: 50,
    loop: true,
    autoplay: false,
    format: (d) =>
      new Date(d + timeMin).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    timeMin,
    timeline: data.timeline ?? [],
  });

  // ── Layer ↔ controls coupling ────────────────────────────────

  function setControlEnabled(el: HTMLElement, enabled: boolean) {
    el.style.opacity = enabled ? "1" : "0.4";
    el.style.pointerEvents = enabled ? "auto" : "none";
  }

  setControlEnabled(hexSlider, false);
  setControlEnabled(hexWidthSlider, false);
  setControlEnabled(scrubberForm, false);

  layerCheckbox.addEventListener("input", () => {
    const vis = (layerCheckbox as any).value as string[];
    setControlEnabled(hexSlider, vis.includes("Density Hexagons"));
    setControlEnabled(hexWidthSlider, vis.includes("Density Hexagons"));
    setControlEnabled(scrubberForm, vis.includes("Track Playback"));
  });

  // ── Controls card ──────────────────────────────────────────────

  const controlsCard = document.createElement("div");
  Object.assign(controlsCard.style, {
    position: "absolute",
    top: "12px",
    left: "12px",
    zIndex: "10",
    pointerEvents: "auto",
    background: "rgba(15, 15, 30, 0.55)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "10px",
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    color: "#e0e0e0",
    fontSize: "13px",
    maxWidth: "280px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
  });

  const controlsGrid = document.createElement("div");
  Object.assign(controlsGrid.style, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  const styleGroup = document.createElement("div");
  styleGroup.appendChild(styleRadio);
  controlsGrid.appendChild(styleGroup);

  const layerGroup = document.createElement("div");
  layerGroup.appendChild(layerCheckbox);
  controlsGrid.appendChild(layerGroup);

  const hexGroup = document.createElement("div");
  hexGroup.appendChild(hexSlider);
  controlsGrid.appendChild(hexGroup);

  const hexWidthGroup = document.createElement("div");
  hexWidthGroup.appendChild(hexWidthSlider);
  controlsGrid.appendChild(hexWidthGroup);

  const fitBtn = document.createElement("button");
  Object.assign(fitBtn.style, {
    padding: "6px 12px",
    border: "none",
    borderRadius: "8px",
    background: "#334155",
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: "12px",
  });
  fitBtn.textContent = "Go to location";
  controlsGrid.appendChild(fitBtn);

  controlsCard.appendChild(controlsGrid);

  const playbackRow = document.createElement("div");
  playbackRow.appendChild(scrubberForm);
  controlsCard.appendChild(playbackRow);

  // ── Map container ──────────────────────────────────────────────

  const mapWrapper = document.createElement("div");
  Object.assign(mapWrapper.style, {
    position: "relative",
    width: "100%",
    borderRadius: "8px",
    overflow: "hidden",
  });

  const mapContainer = document.createElement("div");
  mapContainer.style.height = `${Math.round(window.innerHeight * 0.6)}px`;
  mapContainer.style.width = "100%";
  mapWrapper.appendChild(mapContainer);
  mapWrapper.appendChild(controlsCard);

  // ── Light preset pills ─────────────────────────────────────────

  const lightPresetForm = createLightPresetPills(DEFAULT_LIGHT_PRESET);

  const lightPillsContainer = document.createElement("div");
  Object.assign(lightPillsContainer.style, {
    position: "absolute",
    top: "12px",
    right: "52px",
    zIndex: "10",
    pointerEvents: "auto",
    background: "rgba(15, 15, 30, 0.55)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "999px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
  });
  lightPillsContainer.appendChild(lightPresetForm);

  mapWrapper.appendChild(lightPillsContainer);

  // ── Mapbox + Overlay ───────────────────────────────────────────

  const map = new mapboxgl.Map({
    container: mapContainer,
    style: "mapbox://styles/mapbox/standard",
    accessToken: mapboxToken,
    attributionControl: false,
    pitch: 50,
    bearing: -20,
    config: {
      basemap: {
        lightPreset: DEFAULT_LIGHT_PRESET,
      },
    },
  });

  const overlay = new MapboxOverlay({
    layers: [],
    getTooltip: ({ object, layer }: any) => {
      if (!object || !layer) return null;
      const tooltipStyle = {
        background: "rgba(15,15,30,0.92)",
        color: "#e0e0e0",
        fontSize: "12px",
        borderRadius: "6px",
        padding: "8px 12px",
      };
      if (layer.id === "hexagon") {
        const totalWeight = Math.round(
          object.colorValue ?? object.elevationValue ?? 0,
        );
        const count = object.count ?? object.points?.length ?? 0;
        return {
          html: `<b>${totalWeight.toLocaleString()}</b> detections<br>${count} cell${count !== 1 ? "s" : ""} aggregated`,
          style: tooltipStyle,
        };
      }
      if (
        (layer.id === "zones" || layer.id === "sub-zones") &&
        object.properties
      ) {
        const props = object.properties;
        const name = props.feature_name
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
        const lines = [name];
        if (props.metadata && typeof props.metadata === "object") {
          for (const [k, v] of Object.entries(props.metadata)) {
            if (v != null) lines.push(`${k}: ${v}`);
          }
        }
        return { html: lines.join("<br>"), style: tooltipStyle };
      }
      if (layer.id === "trip-heads") {
        const d = object as TripHeadDatum;
        const typeLabel =
          d.objectType === "pedestrian" ? "Pedestrian" : "Vehicle";
        const speedStr = d.speed > 0 ? `${d.speed.toFixed(1)} mph` : "N/A";
        return {
          html: `<b>${typeLabel}</b><br>Track: ${d.trackId}<br>Speed: ${speedStr}`,
          style: tooltipStyle,
        };
      }
      return null;
    },
  });
  map.addControl(overlay);
  map.addControl(new mapboxgl.NavigationControl());
  map.addControl(
    new mapboxgl.AttributionControl({ compact: true }),
    "bottom-right",
  );
  map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom");

  map.on("load", () => {
    map.fitBounds(
      [
        [bounds.min_lon, bounds.min_lat],
        [bounds.max_lon, bounds.max_lat],
      ],
      { padding: 40, pitch: 50, bearing: -20 },
    );

    const scaleEl = mapContainer.querySelector(
      ".mapboxgl-ctrl-scale",
    ) as HTMLElement | null;
    if (scaleEl) {
      scaleEl.style.borderRadius = "4px";
      scaleEl.style.borderColor = "transparent";
    }
  });

  fitBtn.onclick = () => {
    map.fitBounds(
      [
        [bounds.min_lon, bounds.min_lat],
        [bounds.max_lon, bounds.max_lat],
      ],
      { padding: 40, duration: 1000, pitch: 50, bearing: -20 },
    );
  };

  new ResizeObserver(() => map.resize()).observe(mapContainer);

  // ── Build layers (called reactively from page) ─────────────────

  function buildLayers({
    layerVisibility,
    currentTime,
    hexElevation,
    hexRadius,
    heatmap: heatmapOverride,
    trips: tripsOverride,
    typeFilter,
  }: {
    layerVisibility: string[];
    currentTime: number;
    hexElevation: number;
    hexRadius: number;
    heatmap?: HeatmapCell[];
    trips?: Trip[];
    typeFilter?: string;
  }) {
    const activeHeatmap = heatmapOverride ?? heatmap;
    const activeTrips = tripsOverride ?? trips;
    const zonesVisible = layerVisibility.includes("Zones");
    const hexFilterKey =
      typeFilter === "Pedestrian"
        ? "pedestrian"
        : typeFilter === "Vehicle"
          ? "vehicle"
          : "all";
    const hexColors = HEX_COLOR_RANGES[hexFilterKey];

    return [
      // Zone polygons (rendered below other layers)
      ...(hasZones
        ? [
            new deck.GeoJsonLayer({
              id: "zones",
              data: { type: "FeatureCollection", features: zonePolygons },
              getFillColor: ZONE_FILL_COLOR,
              getLineColor: ZONE_LINE_COLOR,
              getLineWidth: 2,
              lineWidthMinPixels: 2,
              lineWidthUnits: "pixels" as const,
              stroked: true,
              filled: true,
              pickable: true,
              autoHighlight: true,
              highlightColor: [56, 189, 193, 80],
              visible: zonesVisible,
            }),
            new deck.GeoJsonLayer({
              id: "sub-zones",
              data: { type: "FeatureCollection", features: subZonePolygons },
              getFillColor: SUBZONE_FILL_COLOR,
              getLineColor: SUBZONE_LINE_COLOR,
              getLineWidth: 1.5,
              lineWidthMinPixels: 2,
              lineWidthUnits: "pixels" as const,
              stroked: true,
              filled: true,
              pickable: true,
              autoHighlight: true,
              highlightColor: [245, 158, 11, 80],
              visible: zonesVisible,
            }),
          ]
        : []),
      new deck.HexagonLayer({
        id: "hexagon",
        data: [...activeHeatmap],
        getPosition: (d: HeatmapCell) => [d.lon, d.lat],
        getElevationWeight: (d: HeatmapCell) => d.point_count,
        getColorWeight: (d: HeatmapCell) => d.point_count,
        elevationScale: hexElevation,
        radius: hexRadius,
        extruded: true,
        pickable: true,
        opacity: 0.8,
        colorRange: hexColors,
        visible: layerVisibility.includes("Density Hexagons"),
        transitions: {
          elevationScale: {
            duration: 1200,
            easing: (t: number) => 1 - Math.pow(1 - t, 3),
          },
        },
      }),
      new TripsLayer({
        id: "trips",
        data: activeTrips,
        getPath: (d: Trip) => d.coordinates,
        getTimestamps: (d: Trip) => d.timestamps,
        getColor: (d: Trip) =>
          d.objectType === "pedestrian" ? PEDESTRIAN_RGB : VEHICLE_RGB,
        widthMinPixels: 4,
        fadeTrail: true,
        trailLength: 180000,
        currentTime,
        visible: layerVisibility.includes("Track Playback"),
      }),
      new deck.ScatterplotLayer({
        id: "trip-heads",
        data: interpolateTripHeads(
          activeTrips,
          currentTime,
          layerVisibility.includes("Track Playback"),
        ),
        getPosition: (d: TripHeadDatum) => d.position,
        getFillColor: (d: TripHeadDatum) => d.color,
        getRadius: 6,
        radiusMinPixels: 5,
        radiusMaxPixels: 10,
        radiusUnits: "pixels" as const,
        pickable: true,
        antialiasing: true,
        visible: layerVisibility.includes("Track Playback"),
      }),
    ];
  }

  // ── Return handle ──────────────────────────────────────────────

  return {
    container: mapWrapper,
    map,
    overlay,
    scrubberForm,
    layerCheckbox,
    hexSlider,
    hexWidthSlider,
    styleRadio,
    lightPresetForm,
    lightPillsContainer,
    currentStyle: "mapbox://styles/mapbox/standard" as string,
    timeMin,
    timeRange,
    updateHistogram,
    buildLayers,
  };
}

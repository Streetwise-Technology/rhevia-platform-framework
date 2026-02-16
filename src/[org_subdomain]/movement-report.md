---
title: Movement Report
toc: false
---

<style>
.h1 {
  font-family: var(--sans-serif);
  font-size: 28px;
}

.p {
  font-family: var(--sans-serif);
  color: var(--theme-foreground-muted);
  margin-bottom: 15px;
}

.card > * {
  max-width: none;
}
.card figure,
.card table {
  max-width: none;
}

.container {
  width: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--sans-serif);
}
</style>

```js
// === DATA LOADING ===
import {orgName} from "../utils/org-meta.js";
import {formatPeriod} from "../utils/format.js";
import {createActivityTimeline, createActivityArea, createSpeedProfile} from "../components/charts.js";
import {DirectionRose} from "../components/direction-rose.js";
import {createMovementMap, preprocessTrips} from "../components/deck-map.js";

const summary = await FileAttachment(`../data/${observable.params.org_subdomain}/summary.json`).json();
const MAPBOX_TOKEN = await FileAttachment("../data/mapbox-token.json").json();
const periodLabel = formatPeriod(summary.period.start, summary.period.end);

// Pre-aggregated stats data
const timeline = await FileAttachment(`../data/${observable.params.org_subdomain}/timeline.json`).json();
const speedProfile = await FileAttachment(`../data/${observable.params.org_subdomain}/speed-profile.json`).json();
const directionRoseData = await FileAttachment(`../data/${observable.params.org_subdomain}/direction-rose.json`).json();
const zoneStatsRaw = await FileAttachment(`../data/${observable.params.org_subdomain}/zone-stats.json`).json();
const heatmap = await FileAttachment(`../data/${observable.params.org_subdomain}/heatmap.json`).json();

// Map data (thinned/aggregated for Deck.GL performance)
const mapTracks = await FileAttachment(`../data/${observable.params.org_subdomain}/map-tracks.json`).json();
const mapHeatmap = await FileAttachment(`../data/${observable.params.org_subdomain}/map-heatmap.json`).json();

// Zone/sub-zone boundaries (static geometry, may be empty for some orgs)
const zones = await FileAttachment(`../data/${observable.params.org_subdomain}/zones.json`).json();
```


<h1>Movement Insights</h1>
<p>${periodLabel}</p>

```js
// Shared reactive source for type filter
const typeForm = (() => {
  const form = document.createElement("form");
  form.value = "All";
  return form;
})();
const typeFilter = Generators.input(typeForm);

// Factory — each call creates a new synced pill group
function typePills() {
  const options = ["All", "Pedestrian", "Vehicle"];
  const div = document.createElement("div");
  div.classList.add("no-print");
  Object.assign(div.style, {
    display: "flex", gap: "6px", marginBottom: "4px", marginTop: "6px",
  });

  const buttons = options.map(label => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: "4px 14px",
      borderRadius: "999px",
      border: "1px solid var(--theme-foreground-faintest)",
      background: label === "All" ? "var(--theme-foreground)" : "transparent",
      color: label === "All" ? "var(--theme-background)" : "var(--theme-foreground)",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "500",
    });
    btn.onclick = () => {
      typeForm.value = label;
      typeForm.dispatchEvent(new Event("input", { bubbles: true }));
    };
    div.appendChild(btn);
    return btn;
  });

  typeForm.addEventListener("input", () => {
    buttons.forEach(btn => {
      const active = btn.textContent === typeForm.value;
      btn.style.background = active ? "var(--theme-foreground)" : "transparent";
      btn.style.color = active ? "var(--theme-background)" : "var(--theme-foreground)";
    });
  });

  return div;
}
```

```js
// === FILTERED DATA ===
const filterKey = typeFilter === "All" ? "all" : typeFilter.toLowerCase();

// Timeline filtering (pre-binned 5-minute counts)
const filteredTimeline = typeFilter === "All"
  ? timeline
  : timeline.filter(d => d.object_type === typeFilter.toLowerCase());

// Speed profile filtering (per-track avg speed)
const filteredSpeedProfile = typeFilter === "All"
  ? speedProfile
  : speedProfile.filter(d => d.object_type === typeFilter.toLowerCase());

// Direction rose: assemble DirectionBin[] from pre-aggregated rows
const ROSE_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const filteredDirectionRose = (() => {
  const filtered = typeFilter === "All"
    ? directionRoseData
    : directionRoseData.filter(d => d.object_type === typeFilter.toLowerCase());

  const byDir = new Map();
  for (const d of filtered) {
    if (!byDir.has(d.direction)) byDir.set(d.direction, []);
    byDir.get(d.direction).push(d);
  }

  return ROSE_DIRECTIONS.map(dir => {
    const rows = byDir.get(dir) || [];
    const ped = rows.find(r => r.object_type === "pedestrian");
    const veh = rows.find(r => r.object_type === "vehicle");
    const pedCount = ped?.count || 0;
    const vehCount = veh?.count || 0;
    const pedSpeedSum = ped?.speed_sum || 0;
    const vehSpeedSum = veh?.speed_sum || 0;
    const total = pedCount + vehCount;
    return {
      label: dir,
      pedestrian: pedCount,
      vehicle: vehCount,
      total,
      pedAvgSpeed: pedCount > 0 ? pedSpeedSum / pedCount : 0,
      vehAvgSpeed: vehCount > 0 ? vehSpeedSum / vehCount : 0,
      avgSpeed: total > 0 ? (pedSpeedSum + vehSpeedSum) / total : 0,
    };
  });
})();

// Zone stats: aggregate filtered rows by zone
const filteredZoneStats = (() => {
  const filtered = typeFilter === "All"
    ? zoneStatsRaw
    : zoneStatsRaw.filter(d => d.object_type === typeFilter.toLowerCase());

  const byZone = new Map();
  for (const d of filtered) {
    if (!byZone.has(d.zone)) byZone.set(d.zone, {detections: 0, speedSum: 0, ped: 0, veh: 0});
    const z = byZone.get(d.zone);
    z.detections += d.detections;
    z.speedSum += d.speed_sum;
    if (d.object_type === "pedestrian") z.ped += d.detections;
    else z.veh += d.detections;
  }

  return Array.from(byZone, ([zone, z]) => ({
    Zone: zone.replace(/_/g, " "),
    Detections: z.detections,
    "Avg Speed": z.detections > 0 ? +(z.speedSum / z.detections).toFixed(1) : 0,
    "Pedestrian %": z.detections > 0 ? Math.round((z.ped / z.detections) * 100) : 0,
    "Vehicle %": z.detections > 0 ? Math.round((z.veh / z.detections) * 100) : 0,
  })).sort((a, b) => b.Detections - a.Detections);
})();

// Summary: derive from pre-aggregated summary.json based on type filter
const filteredSummary = (() => {
  const total = typeFilter === "All" ? summary.total_detections
    : typeFilter === "Pedestrian" ? summary.pedestrian_count
    : summary.vehicle_count;
  const pedCount = typeFilter === "Vehicle" ? 0 : summary.pedestrian_count;
  const vehCount = typeFilter === "Pedestrian" ? 0 : summary.vehicle_count;

  const avgSpeed = typeFilter === "All" ? summary.avg_speed
    : typeFilter === "Pedestrian" ? summary.ped_avg_speed
    : summary.veh_avg_speed;
  const topSpeed = typeFilter === "All" ? summary.top_speed
    : typeFilter === "Pedestrian" ? summary.ped_top_speed
    : summary.veh_top_speed;

  const hours = (() => {
    const s = new Date(summary.period.start).getTime();
    const e = new Date(summary.period.end).getTime();
    return Math.max((e - s) / 3600000, 1);
  })();

  return {
    total_detections: total,
    pedestrian_count: pedCount,
    vehicle_count: vehCount,
    composition: {
      pedestrian_pct: total > 0 ? Math.round((pedCount / total) * 100) : 0,
      vehicle_pct: total > 0 ? Math.round((vehCount / total) * 100) : 0,
    },
    avg_speed: avgSpeed,
    top_speed: topSpeed,
    flow_rate_per_hour: Math.round(total / hours),
    peak_hour: summary.peak_hour,
    zones_active: summary.zones_active,
    period: summary.period,
    directions: summary.directions_4way?.[filterKey] || {},
  };
})();

// Heatmap filtering (for raw data table)
const filteredHeatmap = typeFilter === "All"
  ? heatmap
  : heatmap.filter(d => d.object_type === typeFilter.toLowerCase());

// Map filtering (thinned/aggregated data for Deck.GL)
const filteredMapTracks = typeFilter === "All"
  ? mapTracks
  : mapTracks.filter(d => d.object_type === typeFilter.toLowerCase());

const filteredMapHeatmap = typeFilter === "All"
  ? mapHeatmap
  : mapHeatmap.filter(d => d.object_type === typeFilter.toLowerCase());

const filteredMapTrips = preprocessTrips(filteredMapTracks, deckMap.timeMin);
```


<h2 >Key Metrics</h2>

${typePills()}

```jsx
import {MetricCards} from "../components/metric-cards.js";

display(<MetricCards summary={filteredSummary} />);
```

## Spatial Activity Map

<p style="color: #6b7280; margin-top: -4px;">Map visualising movement density and flow patterns across the monitored area. Toggle layers and filters to explore different aspects of the data. <br> 
Zoom and scroll, or hold down Control/Shift to rotate.</p>

${typePills()}

```js
const deckMap = createMovementMap({heatmap: mapHeatmap, tracks: mapTracks, mapboxToken: MAPBOX_TOKEN, zones, timeline});
```

```js
const layerVisibility = Generators.input(deckMap.layerCheckbox);
const currentTime = Generators.input(deckMap.scrubberForm);
const hexElevation = Generators.input(deckMap.hexSlider);
const hexRadius = Generators.input(deckMap.hexWidthSlider);
const mapStyle = Generators.input(deckMap.styleRadio);
const lightPreset = Generators.input(deckMap.lightPresetForm);
```

```js
deckMap.overlay.setProps({
  layers: deckMap.buildLayers({layerVisibility, currentTime, hexElevation, hexRadius, heatmap: filteredMapHeatmap, trips: filteredMapTrips, typeFilter})
});
```

```js
deckMap.updateHistogram(filteredTimeline, typeFilter);
```

```js
const isStandard = mapStyle === "mapbox://styles/mapbox/standard";
if (mapStyle !== deckMap.currentStyle) {
  deckMap.currentStyle = mapStyle;
  deckMap.map.setStyle(mapStyle, isStandard ? { config: { basemap: { lightPreset } } } : undefined);
}
deckMap.lightPillsContainer.style.display = isStandard ? "" : "none";
```

```js
if (mapStyle === "mapbox://styles/mapbox/standard") {
  if (deckMap.map.isStyleLoaded()) {
    deckMap.map.setConfigProperty("basemap", "lightPreset", lightPreset);
  } else {
    deckMap.map.once("style.load", () => {
      deckMap.map.setConfigProperty("basemap", "lightPreset", lightPreset);
    });
  }
}
```

<div class="grid grid-cols-1">
<div class="card">

${deckMap.container}

</div>
</div>

## Analytical Breakdown
<p style="color: #6b7280; margin-top: -4px;">Detailed breakdowns of movement patterns, including temporal trends, speed profiles, directional flow, and zone-level statistics. Use the filters to explore specific subsets of the data.</p>

```js
const timelineStyleForm = (() => {
  const form = document.createElement("form");
  form.value = "Area Chart";
  const div = document.createElement("div");
  div.classList.add("no-print");
  Object.assign(div.style, {
    display: "flex", gap: "6px", marginBottom: "4px",
  });
  const options = ["Area Chart", "Bar Chart"];
  const buttons = options.map(label => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: "4px 14px",
      borderRadius: "999px",
      border: "1px solid var(--theme-foreground-faintest)",
      background: label === "Area Chart" ? "var(--theme-foreground)" : "transparent",
      color: label === "Area Chart" ? "var(--theme-background)" : "var(--theme-foreground)",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "500",
    });
    btn.onclick = () => {
      form.value = label;
      form.dispatchEvent(new Event("input", { bubbles: true }));
      buttons.forEach(b => {
        const active = b.textContent === label;
        b.style.background = active ? "var(--theme-foreground)" : "transparent";
        b.style.color = active ? "var(--theme-background)" : "var(--theme-foreground)";
      });
    };
    div.appendChild(btn);
    return btn;
  });
  form.appendChild(div);
  return form;
})();
const timelineStyle = Generators.input(timelineStyleForm);
```

<div class="grid grid-cols-2" style="margin-top: 16px;">
<div class="card grid-colspan-2">

### Activity Timeline

${typePills()}

${timelineStyleForm}

Detection frequency over time, binned in 5-minute intervals and stacked by object type. Hover over a bar for details.

${resize((width) => timelineStyle === "Bar Chart" ? createActivityTimeline(filteredTimeline, {width}) : createActivityArea(filteredTimeline, {width}))}

</div>
</div>

<div class="grid grid-cols-1" style="margin-top: 12px;">
<div class="card">

### Speed Profile

${typePills()}

Per-track average speed, grouped by object type. Each dot represents one track (grouped by track ID); the box plot shows the distribution (median, quartiles, whiskers). Hover for details.

${resize((width) => createSpeedProfile(filteredSpeedProfile, {width}))}

</div>
</div>

<div class="grid grid-cols-1" style="margin-top: 12px;">
<div class="card">

### Directional Breakdown

${typePills()}

Volume of detections by compass direction. Petal size represents count; purple shading shows pedestrian speed, orange shows vehicle speed (lighter = slower, darker = faster). Hover a petal for details.

```jsx
display(<DirectionRose data={filteredDirectionRose} />);
```

</div>
</div>

<div class="grid grid-cols-1" style="margin-top: 12px;">
<div class="card">

### Zone Statistics

${typePills()}

Per-zone detection breakdown derived from track data. Shows detection volume, average speed, and pedestrian/vehicle composition for each monitored zone.

```js
Inputs.table(filteredZoneStats, {
  columns: ["Zone", "Detections", "Avg Speed", "Pedestrian %", "Vehicle %"],
  width: {Zone: 180},
})
```

</div>
</div>

## Raw Data

```js
const rawSourceInput = Inputs.radio(["Heatmap", "Speed Profile"], {value: "Heatmap", label: "Data source"});
const rawSourceFilter = Generators.input(rawSourceInput);
```

```js
const rawHeatmap = filteredHeatmap.map(d => ({
  Type: d.object_type,
  Device: d.device_id,
  Longitude: d.lon,
  Latitude: d.lat,
  "Point Count": d.point_count,
  "Avg Speed": d.avg_speed,
  "Max Speed": d.max_speed,
  "First Seen": d.first_seen,
  "Last Seen": d.last_seen,
}));

const rawSpeedProfile = filteredSpeedProfile.map(d => ({
  Type: d.object_type,
  "Track ID": d.track_id,
  "Avg Speed (mph)": d.avg_speed,
}));

const rawData = rawSourceFilter === "Heatmap" ? rawHeatmap : rawSpeedProfile;
const rawSearch = Inputs.search(rawData, {placeholder: "Search raw data..."});
const rawFiltered = Generators.input(rawSearch);
```

<div class="card">
<p style="color: #6b7280; margin-top: 0;">Filtered view of the underlying raw data for the selected source. Use the search box to filter rows based on any column.</p>
</div>


<div class="grid grid-cols-1" style="margin-top: 12px;">
<div class="card">

<span class="no-print">${typePills()} ${rawSourceInput}</span>
<span class="no-print">${rawSearch}</span>

```js
const rawColumns = rawSourceFilter === "Heatmap"
  ? ["Type", "Device", "Longitude", "Latitude", "Point Count", "Avg Speed", "Max Speed", "First Seen", "Last Seen"]
  : ["Type", "Track ID", "Avg Speed (mph)"];

const rawWidths = rawSourceFilter === "Heatmap"
  ? {"First Seen": 140, "Last Seen": 140}
  : {"Track ID": 200};

display(Inputs.table(rawFiltered, {
  columns: rawColumns,
  width: rawWidths,
  rows: 20,
}))
```

</div>
</div>

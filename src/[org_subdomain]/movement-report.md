---
title: Movement Report
theme: slate
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
import * as d3 from "npm:d3";

const summary = await FileAttachment(`../data/${observable.params.org_subdomain}/summary.json`).json();
const tracks = await FileAttachment(`../data/${observable.params.org_subdomain}/tracks.json`).json();
const heatmap = await FileAttachment(`../data/${observable.params.org_subdomain}/heatmap.json`).json();
const MAPBOX_TOKEN = await FileAttachment("../data/mapbox-token.json").json();
const periodLabel = formatPeriod(summary.period.start, summary.period.end);
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
const filteredTracks = typeFilter === "All"
  ? tracks
  : tracks.filter(d => d.object_type === typeFilter.toLowerCase());

const filteredHeatmap = typeFilter === "All"
  ? heatmap
  : heatmap.filter(d => d.object_type === typeFilter.toLowerCase());

const filteredTrips = preprocessTrips(filteredTracks);

const directionBreakdown = (() => {
  const counts = {North: 0, South: 0, East: 0, West: 0};
  for (const d of filteredTracks) {
    const h = d.heading;
    if (h >= 315 || h < 45) counts.North++;
    else if (h >= 45 && h < 135) counts.East++;
    else if (h >= 135 && h < 225) counts.South++;
    else counts.West++;
  }
  return counts;
})();

const pedCount = filteredTracks.filter(d => d.object_type === "pedestrian").length;
const vehCount = filteredTracks.filter(d => d.object_type === "vehicle").length;
const total = filteredTracks.length;

const filteredSummary = {
  total_detections: total,
  pedestrian_count: pedCount,
  vehicle_count: vehCount,
  composition: {
    pedestrian_pct: total > 0 ? Math.round((pedCount / total) * 100) : 0,
    vehicle_pct: total > 0 ? Math.round((vehCount / total) * 100) : 0,
  },
  avg_speed: Math.round((d3.mean(filteredTracks, d => d.speed) || 0) * 10) / 10,
  top_speed: Math.round((d3.max(filteredTracks, d => d.speed) || 0) * 10) / 10,
  flow_rate_per_hour: total,
  peak_hour: summary.peak_hour,
  zones_active: summary.zones_active,
  period: summary.period,
  directions: directionBreakdown,
};

// Zone statistics derived from filtered tracks
const zoneCounts = new Map();
for (const point of filteredTracks) {
  for (const zone of point.zones_hit) {
    if (!zoneCounts.has(zone)) {
      zoneCounts.set(zone, {zone, detections: 0, totalSpeed: 0, pedestrian: 0, vehicle: 0});
    }
    const z = zoneCounts.get(zone);
    z.detections++;
    z.totalSpeed += point.speed;
    if (point.object_type === "pedestrian") z.pedestrian++;
    else z.vehicle++;
  }
}

const zoneStats = Array.from(zoneCounts.values())
  .map((z) => ({
    Zone: z.zone.replace(/_/g, " "),
    Detections: z.detections,
    "Avg Speed": +(z.totalSpeed / z.detections).toFixed(1),
    "Pedestrian %": Math.round((z.pedestrian / z.detections) * 100),
    "Vehicle %": Math.round((z.vehicle / z.detections) * 100),
  }))
  .sort((a, b) => b.Detections - a.Detections);
```


<h2 >Key Metrics</h2>

${typePills()}

```jsx
import {MetricCards} from "../components/metric-cards.js";

display(<MetricCards summary={filteredSummary} />);
```

## Spatial Activity Map

${typePills()}

```js
const deckMap = createMovementMap({heatmap, tracks, mapboxToken: MAPBOX_TOKEN});
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
  layers: deckMap.buildLayers({layerVisibility, currentTime, hexElevation, hexRadius, heatmap: filteredHeatmap, trips: filteredTrips})
});
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

${typePills()}

```js
const timelineStyleInput = Inputs.radio([ "Area Chart","Bar Chart"], {value: "Area Chart", label: "Style"});
const timelineStyle = Generators.input(timelineStyleInput);
```

<div class="grid grid-cols-2" style="margin-top: 16px;">
<div class="card grid-colspan-2">

### Activity Timeline

<span class="no-print">${timelineStyleInput}</span>

Detection frequency over time, binned in 5-minute intervals and stacked by object type. Hover over a bar for details.

${resize((width) => timelineStyle === "Bar Chart" ? createActivityTimeline(filteredTracks, {width}) : createActivityArea(filteredTracks, {width}))}

</div>
</div>

<div class="grid grid-cols-2" style="margin-top: 12px;">
<div class="card">

### Speed Profile

Per-track average speed, grouped by object type. Each dot represents one track (grouped by track ID); the box plot shows the distribution (median, quartiles, whiskers). Hover for details.

${resize((width) => createSpeedProfile(filteredTracks, {width}))}

</div>
<div class="card">

### Directional Breakdown

Volume of detections by compass direction. Petal size represents count; purple shading shows pedestrian speed, orange shows vehicle speed (lighter = slower, darker = faster). Hover a petal for details.

```jsx
display(<DirectionRose tracks={filteredTracks} />);
```

</div>
</div>

<div class="grid grid-cols-1" style="margin-top: 12px;">
<div class="card">

### Zone Statistics

${typePills()}

Per-zone detection breakdown derived from track data. Shows detection volume, average speed, and pedestrian/vehicle composition for each monitored zone.

```js
Inputs.table(zoneStats, {
  columns: ["Zone", "Detections", "Avg Speed", "Pedestrian %", "Vehicle %"],
  width: {Zone: 180},
})
```

</div>
</div>

## Raw Data

```js
const rawSourceInput = Inputs.radio(["Heatmap", "Track"], {value: "Heatmap", label: "Data source"});
const rawSourceFilter = Generators.input(rawSourceInput);
```

```js
const rawHeatmap = heatmap
  .filter(d => typeFilter === "All" || d.object_type === typeFilter.toLowerCase())
  .map(d => ({
    Source: "Heatmap",
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

const rawTracks = tracks
  .filter(d => typeFilter === "All" || d.object_type === typeFilter.toLowerCase())
  .map(d => ({
    Source: "Track",
    Type: d.object_type,
    Device: d.device_id,
    Longitude: d.longitude,
    Latitude: d.latitude,
    "Point Count": 1,
    "Speed": d.speed,
    "Timestamp": d.timestamp,
  }));

const rawData = rawSourceFilter === "Heatmap" ? rawHeatmap : rawTracks;
const rawSearch = Inputs.search(rawData, {placeholder: "Search raw data..."});
const rawFiltered = Generators.input(rawSearch);
```

<div class="grid grid-cols-1" style="margin-top: 12px;">
<div class="card">

<span class="no-print">${typePills()} ${rawSourceInput}</span>
<span class="no-print">${rawSearch}</span>

```js
const rawColumns = rawSourceFilter === "Heatmap"
  ? ["Source", "Type", "Device", "Longitude", "Latitude", "Point Count", "Avg Speed", "Max Speed", "First Seen", "Last Seen"]
  : ["Source", "Type", "Device", "Longitude", "Latitude", "Point Count", "Speed", "Timestamp"];

const rawWidths = rawSourceFilter === "Heatmap"
  ? {"First Seen": 140, "Last Seen": 140}
  : {"Timestamp": 160};

display(Inputs.table(rawFiltered, {
  columns: rawColumns,
  width: rawWidths,
  rows: 20,
}))
```

</div>
</div>

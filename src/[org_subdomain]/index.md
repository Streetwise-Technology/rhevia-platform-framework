---
title: Executive Summary
theme: slate
toc: false
---

```js
import {orgName} from "../utils/org-meta.js";
import {formatPeriod} from "../utils/format.js";

const name = orgName(observable.params.org_subdomain);
const summary = await FileAttachment(`../data/${observable.params.org_subdomain}/summary.json`).json();
const periodLabel = formatPeriod(summary.period.start, summary.period.end);
```

<div class="hero">
<h1>Movement Intelligence Report</h1>
<h2>Movement to meaning</h2>
<p style="color: #6b7280;">${periodLabel}</p>
</div>

<div class="sub-heading">
  This report presents a comprehensive analysis of movement activity recorded for <b>${name}</b> during the reporting period. It consolidates detection volumes, spatial density patterns, speed profiles, directional flow, and zone/area-level breakdowns into a single report, designed to support operational awareness and decision-making.
</div>

---

<h3 style="font-family: var(--sans-serif);">At a glance</h3>

<div class="grid grid-cols-4">
  <div class="card">
    <h3>${summary.total_detections.toLocaleString()}</h3>
    <p style="color: #6b7280; font-size: 13px; margin: 0;">Total Movement Detections</p>
  </div>
  <div class="card">
    <h3>${summary.zones_active}</h3>
    <p style="color: #6b7280; font-size: 13px; margin: 0;">Zones Monitored</p>
  </div>
  <div class="card">
    <h3>${summary.peak_hour}</h3>
    <p style="color: #6b7280; font-size: 13px; margin: 0;">General Peak Hour Activity</p>
  </div>
  <div class="card">
    <h3>${summary.composition.pedestrian_pct}% / ${summary.composition.vehicle_pct}%</h3>
    <p style="color: #6b7280; font-size: 13px; margin: 0;">Pedestrian / Vehicle Composition Split</p>
  </div>
</div>

<style>

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--sans-serif);
  margin: 4rem 0 8rem;
  text-wrap: balance;
  text-align: center;
}

.hero h1 {
  margin: 1rem 0;
  padding: 1rem 0;
  max-width: none;
  font-size: 14vw;
  font-weight: 900;
  line-height: 1;
  background: linear-gradient(30deg, var(--theme-foreground-focus), currentColor);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero h2 {
  margin: 0;
  max-width: 34em;
  font-size: 20px;
  font-style: initial;
  font-weight: 500;
  line-height: 1.5;
  color: var(--theme-foreground-muted);
}

@media (min-width: 640px) {
  .hero h1 {
    font-size: 90px;
  }
}

.sub-heading {
  text-align: center;
  font-family: var(--sans-serif);
  color: var(--theme-foreground-muted);
  margin-bottom: 32px
}

.content {

}

</style>
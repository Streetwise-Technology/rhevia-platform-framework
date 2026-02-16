---
title: Closing Remarks
---

```js
import {orgName} from "../utils/org-meta.js";
import {formatPeriod} from "../utils/format.js";

const name = orgName(observable.params.org_subdomain);
const summary = await FileAttachment(`../data/${observable.params.org_subdomain}/summary.json`).json();
const periodLabel = formatPeriod(summary.period.start, summary.period.end);
```

# Closing Remarks

<p style="color: #6b7280; margin-top: -8px;">${periodLabel}</p>

---

## Summary of Findings

During the reporting period, a total of **${summary.total_detections.toLocaleString()} movements** were detected across **${summary.zones_active} monitored zones** at ${name}. The detection composition was **${summary.composition.pedestrian_pct}% pedestrian** and **${summary.composition.vehicle_pct}% vehicle** traffic.

The average recorded speed was **${summary.avg_speed} km/h**, with a maximum of **${summary.top_speed} km/h**. Peak activity was concentrated around **${summary.peak_hour}**, indicating a clear temporal pattern in site usage during this period.

These findings provide a baseline for understanding movement patterns and can be used to inform operational planning, safety assessments, and resource allocation decisions.

---

## Methodology

Movement data was collected via automated detection sensors deployed across ${name}. Each detection event captures object type, position, speed, heading, and timestamp. Key processing steps include:

- **Classification** — Detections are categorised as pedestrian or vehicle based on object characteristics at the point of detection.
- **Spatial aggregation** — Detection points are aggregated into grid cells to produce density heatmaps and zone-level statistics.
- **Track reconstruction** — Sequential detection points sharing a common track identifier are linked to form movement trajectories, enabling playback and directional analysis.
- **Temporal binning** — Detection timestamps are binned into 5-minute intervals for activity timeline analysis.

---

## Disclaimer

This report is generated from automated sensor data and is intended for operational intelligence purposes only. Detection counts and classifications may vary due to sensor coverage, environmental conditions, occlusion, and classification confidence thresholds. Figures presented should be treated as indicative rather than absolute.

All data is processed and stored in accordance with applicable data protection regulations. No personally identifiable information is captured or retained by the detection system.

---

## Contact

For questions regarding this report, to request additional analysis, or to discuss findings in further detail, please contact your Rhevia account representative.

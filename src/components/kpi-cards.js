// kpi-cards.js — KPI card components for dashboard summaries
//
// Usage: import { createKPICards } from "../components/kpi-cards.js";

import * as d3 from "npm:d3";

const COLORS = {
  pedestrian: "#f59e0b",
  vehicle: "#8b5cf6",
  accent: "#f472b6",
  cardBg: "#1a1a2e",
  textPrimary: "#f0f0f0",
  textSecondary: "#9ca3af",
};

const CARD_STYLE = `
  background: ${COLORS.cardBg};
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 130px;
  gap: 6px;
`;

const LABEL_STYLE = `
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${COLORS.textSecondary};
  margin: 0;
`;

const VALUE_STYLE = `
  font-size: 28px;
  font-weight: 700;
  color: ${COLORS.textPrimary};
  margin: 0;
  line-height: 1.1;
`;

function createDonutCard(summary) {
  const card = document.createElement("div");
  card.style.cssText = CARD_STYLE;

  const size = 90;
  const radius = size / 2;
  const inner = radius * 0.6;

  const data = [
    {label: "Pedestrian", value: summary.composition.pedestrian_pct, color: COLORS.pedestrian},
    {label: "Vehicle", value: summary.composition.vehicle_pct, color: COLORS.vehicle},
  ];

  const arc = d3.arc().innerRadius(inner).outerRadius(radius);
  const pie = d3.pie().value((d) => d.value).sort(null);

  const svg = d3.create("svg")
    .attr("width", size)
    .attr("height", size)
    .attr("viewBox", `${-radius} ${-radius} ${size} ${size}`);

  svg.selectAll("path")
    .data(pie(data))
    .join("path")
    .attr("d", arc)
    .attr("fill", (d) => d.data.color);

  // Center text
  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", COLORS.textPrimary)
    .attr("font-size", "14px")
    .attr("font-weight", "700")
    .text(summary.total_detections.toLocaleString());

  card.appendChild(svg.node());

  // Legend
  const legend = document.createElement("div");
  legend.style.cssText = "display: flex; gap: 10px; font-size: 10px;";
  for (const d of data) {
    const item = document.createElement("span");
    item.style.cssText = `color: ${d.color};`;
    item.textContent = `● ${d.label} ${d.value}%`;
    legend.appendChild(item);
  }
  card.appendChild(legend);

  // Label
  const label = document.createElement("p");
  label.style.cssText = LABEL_STYLE;
  label.textContent = "Composition";
  card.appendChild(label);

  return card;
}

function createStatCard(value, unit, label) {
  const card = document.createElement("div");
  card.style.cssText = CARD_STYLE;

  const val = document.createElement("p");
  val.style.cssText = VALUE_STYLE;
  val.innerHTML = typeof value === "string" ? value : value.toLocaleString();
  card.appendChild(val);

  if (unit) {
    const u = document.createElement("p");
    u.style.cssText = `font-size: 13px; color: ${COLORS.accent}; margin: 0;`;
    u.textContent = unit;
    card.appendChild(u);
  }

  const lbl = document.createElement("p");
  lbl.style.cssText = LABEL_STYLE;
  lbl.textContent = label;
  card.appendChild(lbl);

  return card;
}

function createDirectionCard(directions) {
  const card = document.createElement("div");
  card.style.cssText = CARD_STYLE + "min-width: 180px;";

  const order = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const max = Math.max(...Object.values(directions));

  const bars = document.createElement("div");
  bars.style.cssText = "width: 100%; display: flex; flex-direction: column; gap: 2px;";

  for (const dir of order) {
    const count = directions[dir] || 0;
    const pct = max > 0 ? (count / max) * 100 : 0;

    const row = document.createElement("div");
    row.style.cssText = "display: flex; align-items: center; gap: 4px; font-size: 10px;";

    const dirLabel = document.createElement("span");
    dirLabel.style.cssText = `width: 20px; text-align: right; color: ${COLORS.textSecondary};`;
    dirLabel.textContent = dir;

    const barBg = document.createElement("div");
    barBg.style.cssText = "flex: 1; height: 8px; background: #2a2a4a; border-radius: 4px; overflow: hidden;";

    const barFill = document.createElement("div");
    barFill.style.cssText = `width: ${pct}%; height: 100%; background: ${COLORS.accent}; border-radius: 4px;`;

    barBg.appendChild(barFill);

    const countLabel = document.createElement("span");
    countLabel.style.cssText = `width: 28px; text-align: right; color: ${COLORS.textSecondary}; font-size: 9px;`;
    countLabel.textContent = count;

    row.append(dirLabel, barBg, countLabel);
    bars.appendChild(row);
  }

  card.appendChild(bars);

  const label = document.createElement("p");
  label.style.cssText = LABEL_STYLE + "margin-top: 4px;";
  label.textContent = "Direction";
  card.appendChild(label);

  return card;
}

/**
 * Creates a horizontal row of KPI stat cards from summary data.
 * @param {Object} summary - The summary JSON from the data loader
 * @returns {HTMLElement}
 */
export function createKPICards(summary) {
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    width: 100%;
  `;

  container.append(
    createDonutCard(summary),
    createStatCard(summary.total_detections, null, "Total Detections"),
    createStatCard(summary.flow_rate_per_hour, "/hour", "Flow Rate"),
    createStatCard(`${summary.avg_speed} <span style="font-size:14px;color:${COLORS.textSecondary}">/ ${summary.top_speed}</span>`, "avg / top", "Speed"),
    createDirectionCard(summary.directions),
    createStatCard(summary.freight_entries, "entries", "Freight"),
  );

  return container;
}

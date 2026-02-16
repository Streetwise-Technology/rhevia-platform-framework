import React from "npm:react";
import * as d3 from "npm:d3";
import { BRAND_COLORS } from "./theme.js";

interface Summary {
  total_detections: number;
  pedestrian_count: number;
  vehicle_count: number;
  composition: { pedestrian_pct: number; vehicle_pct: number };
  avg_speed: number;
  top_speed: number;
  flow_rate_per_hour: number;
  directions?: Record<string, number>;
}


const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  padding: "16px 12px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  background: "rgba(15, 15, 30, 0.55)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "var(--theme-foreground-muted, #9ca3af)",
  margin: 0,
};

const valueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "currentColor",
  margin: 0,
  lineHeight: 1.1,
};

function DonutCard({ summary }: { summary: Summary }) {
  const size = 90;
  const radius = size / 2;
  const inner = radius * 0.6;

  const slices = [
    {
      label: "Pedestrian",
      value: summary.composition.pedestrian_pct,
      color: BRAND_COLORS.pedestrian,
    },
    {
      label: "Vehicle",
      value: summary.composition.vehicle_pct,
      color: BRAND_COLORS.vehicle,
    },
  ].filter((s) => s.value > 0);

  const arc = d3
    .arc<d3.PieArcDatum<(typeof slices)[0]>>()
    .innerRadius(inner)
    .outerRadius(radius);
  const pie = d3
    .pie<(typeof slices)[0]>()
    .value((d) => d.value)
    .sort(null);
  const arcs = pie(slices);

  return (
    <div style={cardStyle} className="card">
      <svg
        width={size}
        height={size}
        viewBox={`${-radius} ${-radius} ${size} ${size}`}
      >
        {arcs.map((a, i) => (
          <path key={i} d={arc(a) || ""} fill={a.data.color} />
        ))}
        <text
          textAnchor="middle"
          dy="0.35em"
          fill="currentColor"
          fontSize="14px"
          fontWeight="700"
        >
          {summary.total_detections.toLocaleString()}
        </text>
      </svg>
      <div style={{ display: "flex", gap: 10, fontSize: 10 }}>
        {slices.map((s) => (
          <span key={s.label} style={{ color: s.color }}>
            ● {s.label} {s.value}%
          </span>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  value,
  unit,
  label,
  subtitle,
}: {
  value: string | number;
  unit?: string;
  label: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <div style={cardStyle} className="card">
      <p
        style={valueStyle}
        dangerouslySetInnerHTML={{
          __html: typeof value === "string" ? value : value.toLocaleString(),
        }}
      />
      {unit && (
        <p style={{ fontSize: 13, color: BRAND_COLORS.accent, margin: 0 }}>{unit}</p>
      )}
      <p style={labelStyle}>{label}</p>
      {subtitle && (
        <p
          style={{
            fontSize: 10,
            color: "var(--theme-foreground-muted, #9ca3af)",
            margin: "2px 0 0",
            textAlign: "center",
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

const DIRECTION_ARROWS: Record<string, string> = {
  North: "\u2191",
  South: "\u2193",
  East: "\u2192",
  West: "\u2190",
};

function DirectionCard({ directions }: { directions: Record<string, number> }) {
  return (
    <div style={cardStyle} className="card">
      <p style={labelStyle}>Directional Breakdown</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          width: "100%",
          marginTop: 4,
        }}
      >
        {(["North", "South", "East", "West"] as const).map((dir) => (
          <div
            key={dir}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: BRAND_COLORS.accent,
                width: 24,
                textAlign: "center",
              }}
            >
              {DIRECTION_ARROWS[dir]}
            </span>
            <div>
              <p style={{ ...valueStyle, fontSize: 18 }}>
                {(directions[dir] ?? 0).toLocaleString()}
              </p>
              <p style={{ ...labelStyle, fontSize: 9 }}>{dir}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricCards({ summary }: { summary: Summary }) {
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    width: "100%",
  };

  return (
    <div style={gridStyle}>
      <DonutCard summary={summary} />
      <StatCard
        value={summary.total_detections}
        label="Total Detections"
        subtitle={
          <>
            {summary.pedestrian_count > 0 && (
              <>
                <span style={{ color: BRAND_COLORS.pedestrian }}>●</span>{" "}
                {summary.pedestrian_count.toLocaleString()} pedestrians
              </>
            )}
            {summary.pedestrian_count > 0 && summary.vehicle_count > 0 && " · "}
            {summary.vehicle_count > 0 && (
              <>
                <span style={{ color: BRAND_COLORS.vehicle }}>●</span>{" "}
                {summary.vehicle_count.toLocaleString()} vehicles
              </>
            )}
          </>
        }
      />
      <StatCard
        value={summary.flow_rate_per_hour}
        unit="/hour"
        label="Flow Rate"
      />
      <StatCard
        value={`${summary.avg_speed} / ${summary.top_speed}`}
        unit="avg / top"
        label="Speed (mph)"
      />
      {summary.directions && <DirectionCard directions={summary.directions} />}
    </div>
  );
}

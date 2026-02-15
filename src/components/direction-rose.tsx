import React from "npm:react";
import * as d3 from "npm:d3";

export interface DirectionBin {
  label: string;
  pedestrian: number;
  vehicle: number;
  total: number;
  pedAvgSpeed: number;
  vehAvgSpeed: number;
  avgSpeed: number;
}

// Smoother 5-stop gradients for each type
const COLOR_RANGES = {
  pedestrian: ["#ede9fe", "#c4b5fd", "#8b5cf6", "#7c3aed", "#5b21b6"],
  vehicle: ["#fef3c7", "#fcd34d", "#f59e0b", "#d97706", "#92400e"],
  combined: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
};

function buildColorScale(colors: string[], domain: [number, number]) {
  const stops = colors.map(
    (_, i) => domain[0] + (i / (colors.length - 1)) * (domain[1] - domain[0]),
  );
  return d3
    .scaleLinear<string>()
    .domain(stops)
    .range(colors)
    .interpolate(d3.interpolateRgb as any)
    .clamp(true);
}

export function DirectionRose({ data }: { data: DirectionBin[] }) {
  const [tooltip, setTooltip] = React.useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const size = 360;
  const margin = 40;
  const outerRadius = (size - margin * 2) / 2;
  const innerRadius = 20;
  const center = size / 2;

  const maxTotal = d3.max(data, (d: DirectionBin) => d.total) || 1;

  // Determine rendering mode
  const hasPed = data.some((d) => d.pedestrian > 0);
  const hasVeh = data.some((d) => d.vehicle > 0);
  const isCombined = hasPed && hasVeh;

  // Speed domain across all data
  const allSpeeds = data.filter((d) => d.total > 0).map((d) => d.avgSpeed);
  const allPedSpeeds = data
    .filter((d) => d.pedAvgSpeed > 0)
    .map((d) => d.pedAvgSpeed);
  const allVehSpeeds = data
    .filter((d) => d.vehAvgSpeed > 0)
    .map((d) => d.vehAvgSpeed);

  const speedDomain: [number, number] =
    allSpeeds.length > 0
      ? [d3.min(allSpeeds) as number, d3.max(allSpeeds) as number]
      : [0, 1];
  const pedSpeedDomain: [number, number] =
    allPedSpeeds.length > 0
      ? [d3.min(allPedSpeeds) as number, d3.max(allPedSpeeds) as number]
      : [0, 1];
  const vehSpeedDomain: [number, number] =
    allVehSpeeds.length > 0
      ? [d3.min(allVehSpeeds) as number, d3.max(allVehSpeeds) as number]
      : [0, 1];

  const combinedColorScale = buildColorScale(
    COLOR_RANGES.combined,
    speedDomain,
  );
  const pedColorScale = buildColorScale(
    COLOR_RANGES.pedestrian,
    pedSpeedDomain,
  );
  const vehColorScale = buildColorScale(COLOR_RANGES.vehicle, vehSpeedDomain);

  const angleScale = d3
    .scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([0, 2 * Math.PI]);

  const radiusScale = d3
    .scaleLinear()
    .domain([0, maxTotal])
    .range([0, outerRadius - innerRadius]);

  const bandwidth = angleScale.bandwidth();
  const gridValues = [0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxTotal));
  const labelRadius = outerRadius + 18;

  // Single unified arc (combined or single-type mode)
  const totalArc = d3
    .arc<DirectionBin>()
    .innerRadius(innerRadius)
    .outerRadius((d: DirectionBin) => innerRadius + radiusScale(d.total))
    .startAngle((d: DirectionBin) => angleScale(d.label) ?? 0)
    .endAngle((d: DirectionBin) => (angleScale(d.label) ?? 0) + bandwidth)
    .padAngle(0.04)
    .cornerRadius(3);

  // Stacked arcs (only used in single-type filtered views — not combined)
  const pedArc = d3
    .arc<DirectionBin>()
    .innerRadius(innerRadius)
    .outerRadius((d: DirectionBin) => innerRadius + radiusScale(d.pedestrian))
    .startAngle((d: DirectionBin) => angleScale(d.label) ?? 0)
    .endAngle((d: DirectionBin) => (angleScale(d.label) ?? 0) + bandwidth)
    .padAngle(0.04)
    .cornerRadius(3);

  const vehArc = d3
    .arc<DirectionBin>()
    .innerRadius(innerRadius)
    .outerRadius((d: DirectionBin) => innerRadius + radiusScale(d.vehicle))
    .startAngle((d: DirectionBin) => angleScale(d.label) ?? 0)
    .endAngle((d: DirectionBin) => (angleScale(d.label) ?? 0) + bandwidth)
    .padAngle(0.04)
    .cornerRadius(3);

  function handleMouseMove(e: React.MouseEvent, text: string) {
    const svg = (e.target as SVGElement).closest("svg");
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    setTooltip({ x: svgP.x, y: svgP.y - 28, text });
  }

  // Pick active color range for the legend
  const activeColors = isCombined
    ? COLOR_RANGES.combined
    : hasPed
      ? COLOR_RANGES.pedestrian
      : COLOR_RANGES.vehicle;
  const activeLabel = isCombined
    ? "All Detections"
    : hasPed
      ? "Pedestrian"
      : "Vehicle";

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <svg
        viewBox={`0 0 ${size} ${size + 30}`}
        style={{ width: "100%", maxWidth: size, height: "auto" }}
        onMouseLeave={() => setTooltip(null)}
      >
        <g transform={`translate(${center}, ${center})`}>
          {/* Grid circles */}
          {gridValues.map((val, i) => (
            <circle
              key={i}
              r={innerRadius + radiusScale(val)}
              fill="none"
              stroke="var(--theme-foreground-faintest, #374151)"
              strokeDasharray="3 3"
              strokeWidth={0.5}
            />
          ))}

          {/* Rose petals */}
          {isCombined
            ? /* Combined mode: single petal per direction, unified color */
              data.map((d) =>
                d.total > 0 ? (
                  <path
                    key={d.label}
                    d={totalArc(d) || ""}
                    fill={combinedColorScale(d.avgSpeed)}
                    stroke="var(--theme-background, #1e1e2e)"
                    strokeWidth={1}
                    style={{ cursor: "pointer" }}
                    onMouseMove={(e: React.MouseEvent) =>
                      handleMouseMove(
                        e,
                        `${d.label}\n${d.total.toLocaleString()} detections\nAvg speed: ${d.avgSpeed.toFixed(1)} mph\n${d.pedestrian} ped · ${d.vehicle} veh`,
                      )
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                ) : null,
              )
            : /* Single-type mode: type-specific color */
              data.map((d) => {
                if (hasPed && d.pedestrian > 0) {
                  return (
                    <path
                      key={`ped-${d.label}`}
                      d={pedArc(d) || ""}
                      fill={pedColorScale(d.pedAvgSpeed)}
                      stroke="var(--theme-background, #1e1e2e)"
                      strokeWidth={1}
                      style={{ cursor: "pointer" }}
                      onMouseMove={(e: React.MouseEvent) =>
                        handleMouseMove(
                          e,
                          `${d.label} — Pedestrian\n${d.pedestrian.toLocaleString()} detections\nAvg speed: ${d.pedAvgSpeed.toFixed(1)} mph`,
                        )
                      }
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                }
                if (hasVeh && d.vehicle > 0) {
                  return (
                    <path
                      key={`veh-${d.label}`}
                      d={vehArc(d) || ""}
                      fill={vehColorScale(d.vehAvgSpeed)}
                      stroke="var(--theme-background, #1e1e2e)"
                      strokeWidth={1}
                      style={{ cursor: "pointer" }}
                      onMouseMove={(e: React.MouseEvent) =>
                        handleMouseMove(
                          e,
                          `${d.label} — Vehicle\n${d.vehicle.toLocaleString()} detections\nAvg speed: ${d.vehAvgSpeed.toFixed(1)} mph`,
                        )
                      }
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                }
                return null;
              })}

          {/* Direction labels */}
          {data.map((d) => {
            const midAngle =
              (angleScale(d.label) ?? 0) + bandwidth / 2 - Math.PI / 2;
            const x = Math.cos(midAngle) * labelRadius;
            const y = Math.sin(midAngle) * labelRadius;
            return (
              <text
                key={`lbl-${d.label}`}
                x={x}
                y={y}
                dy="0.35em"
                textAnchor="middle"
                fill="var(--theme-foreground-muted, #9ca3af)"
                fontSize={11}
                fontWeight={d.label.length === 1 ? 700 : 500}
              >
                {d.label}
              </text>
            );
          })}
        </g>

        {/* Legend — centered, with Slow/Fast labels */}

        <defs>
          <linearGradient id="speed-grad" x1="0" x2="1" y1="0" y2="0">
            {activeColors.map((c: string, i: number) => (
              <stop
                key={i}
                offset={`${(i / (activeColors.length - 1)) * 100}%`}
                stopColor={c}
              />
            ))}
          </linearGradient>
        </defs>
        <g transform={`translate(${center}, ${size + 6})`} textAnchor="middle">
          <text
            x={-52}
            y={-2}
            fill="var(--theme-foreground-muted, #9ca3af)"
            fontSize={9}
            textAnchor="end"
          >
            Slow
          </text>
          <rect
            x={-48}
            y={-10}
            width={96}
            height={8}
            rx={3}
            fill="url(#speed-grad)"
          />
          <text
            x={52}
            y={-2}
            fill="var(--theme-foreground-muted, #9ca3af)"
            fontSize={9}
            textAnchor="start"
          >
            Fast
          </text>
          <text
            x={0}
            y={10}
            fill="var(--theme-foreground-muted, #9ca3af)"
            fontSize={9}
          >
            {activeLabel}
          </text>
        </g>

        {/* Tooltip */}
        {tooltip &&
          (() => {
            const lines = tooltip.text.split("\n");
            const maxLen = Math.max(...lines.map((l: string) => l.length));
            const boxW = maxLen * 6.4 + 16;
            const boxH = lines.length * 15 + 8;
            return (
              <g
                transform={`translate(${tooltip.x}, ${tooltip.y})`}
                style={{ pointerEvents: "none" }}
              >
                <rect
                  x={-boxW / 2}
                  y={-boxH}
                  width={boxW}
                  height={boxH}
                  rx={5}
                  fill="rgba(0,0,0,0.88)"
                />
                {lines.map((line: string, i: number) => (
                  <text
                    key={i}
                    x={0}
                    y={-boxH + 14 + i * 15}
                    fill="white"
                    fontSize={11}
                    textAnchor="middle"
                    fontFamily="var(--sans-serif, system-ui)"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })()}
      </svg>
    </div>
  );
}

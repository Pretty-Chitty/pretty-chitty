import React, { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import Color from "color";
import { SparkChit } from "../game/SparkChit";
import { PlayerChit } from "../game/PlayerChit";

interface ChartDataPoint {
  clock: number;
  value: number;
}

interface ChartLine {
  id: string;
  color: string;
  points: ChartDataPoint[];
  finalValue: number;
  icon?: string;
}

interface SparkLineChartProps {
  label: string;
  playerData: {
    [playerId: string]: { player: PlayerChit; history: { clock: number; chit: SparkChit }[] };
  };
  maxClock: number;
  backgroundColor?: string;
  height?: number;
  width?: number;
}

const HALO_OPACITY = 0.35;

// One halo color for every line in the chart, picked as the extreme furthest
// from the bg — so the halo is always visible against the bg and provides the
// edge that separates each line from the bg. Per-line halos flipping between
// black and white read as arbitrary noise.
function getUnifiedHaloColor(backgroundColor: string): string {
  return Color(backgroundColor).isLight() ? "#000000" : "#ffffff";
}

// The halo only does its job when every line clearly contrasts against it —
// otherwise a dark line drowns into the dark halo and you get fuzz instead of
// a crisp edge. Push any too-close line toward the halo's opposite (which is
// also the bg side) in 5% steps until WCAG luminance contrast clears the
// threshold. This is the "lighten the dark line until it's distinguishable"
// step — only the dark-red-burger gets touched in a sea of light pastels.
function adjustLineForHalo(lineColor: string, haloColor: string, minRatio = 7): string {
  const halo = Color(haloColor);
  const line = Color(lineColor);
  if (line.contrast(halo) >= minRatio) return line.hex();
  const target = halo.isDark() ? Color("#ffffff") : Color("#000000");
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = line.mix(target, t);
    if (candidate.contrast(halo) >= minRatio) return candidate.hex();
  }
  return target.hex();
}

export function SparkLineChart({
  label,
  playerData,
  maxClock: externalMaxClock,
  backgroundColor = "#ffffff",
  height = 300,
  width: containerWidth = 520,
}: SparkLineChartProps) {
  const chartData = useMemo(() => {
    const lines: ChartLine[] = [];
    let minValue = Infinity;
    let maxValue = -Infinity;

    // Process each player's data
    Object.entries(playerData).forEach(([playerId, { player, history }]) => {
      if (!history || history.length === 0) return;

      const points: ChartDataPoint[] = history.map((entry) => {
        const sparkChit = entry.chit as SparkChit;
        const value = sparkChit.value ?? 0;

        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);

        return {
          clock: entry.clock ?? 0,
          value,
        };
      });

      const lastEntry = history[history.length - 1];
      const sparkChit = lastEntry.chit as SparkChit;

      lines.push({
        id: playerId,
        color: player.color,
        points,
        finalValue: sparkChit.value ?? 0,
        icon: player.imageUrl,
      });
    });

    // Handle case where there are no valid data points
    if (minValue === Infinity || maxValue === -Infinity) {
      minValue = 0;
      maxValue = 1;
    }

    return { lines, minValue, maxValue };
  }, [playerData]);

  const { lines, minValue, maxValue } = chartData;
  const maxClock = externalMaxClock || 1;

  const labelAreaWidth = 80; // Space for labels, icons, and numbers on the right
  const chartWidth = containerWidth;
  const svgWidth = chartWidth + labelAreaWidth;
  const chartHeight = height;

  // Add some padding to the value range
  const valueRange = maxValue - minValue || 1;
  const valuePadding = valueRange * 0.1;
  const chartMinValue = minValue - valuePadding;
  const chartMaxValue = maxValue + valuePadding;
  const chartValueRange = chartMaxValue - chartMinValue;

  // Calculate adjusted label positions to avoid overlaps
  const labelHeight = 24;
  const minLabelSpacing = 4;
  const iconSize = 20;

  const labelPositions = useMemo(() => {
    if (lines.length === 0) return {};

    const positions: { lineId: string; y: number; originalY: number }[] = lines.map((line) => {
      const lastPoint = line.points[line.points.length - 1];
      const y = chartHeight - ((lastPoint.value - chartMinValue) / chartValueRange) * chartHeight;
      return { lineId: line.id, y, originalY: y };
    });

    // Sort by Y position
    positions.sort((a, b) => a.y - b.y);

    // Adjust positions to avoid overlaps
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const current = positions[i];
      const minY = prev.y + labelHeight + minLabelSpacing;

      if (current.y < minY) {
        current.y = minY;
      }
    }

    // Convert back to a map for easy lookup
    const positionMap: { [id: string]: number } = {};
    positions.forEach((pos) => {
      positionMap[pos.lineId] = pos.y;
    });

    return positionMap;
  }, [lines, chartMinValue, chartValueRange, chartHeight, labelHeight, minLabelSpacing]);

  if (lines.length === 0) {
    return null;
  }

  // Convert data coordinates to SVG coordinates
  const getX = (clock: number) => (clock / maxClock) * chartWidth;
  const getY = (value: number) => chartHeight - ((value - chartMinValue) / chartValueRange) * chartHeight;
  const chartEndX = chartWidth;

  // The chart always gets one unified halo (opposite of bg). Each line is then
  // shifted only if it sits too close to the halo's luminance — so on a light
  // bg the halo is dark, all the light pastels keep their hue, and the lone
  // dark line gets lightened until the dark halo can actually frame it.
  const haloColor = getUnifiedHaloColor(backgroundColor);
  const displayLines = lines.map((line) => ({
    ...line,
    color: adjustLineForHalo(line.color, haloColor),
  }));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", my: 4 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {label}
      </Typography>
      <svg
        width="100%"
        height="auto"
        viewBox={`0 0 ${svgWidth} ${height}`}
        preserveAspectRatio="preserve"
        style={{ overflow: "visible", maxWidth: "100%" }}
      >
        <defs>
          {/* Soften halo edges so the contrast outline reads as a smooth glow,
              not a stairstepped stroke. */}
          <filter id="sparkline-soften" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>

        {/* Grid lines */}
        <g opacity={0.1}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = chartHeight * (1 - ratio);
            return (
              <line key={`grid-${ratio}`} x1={0} y1={y} x2={chartEndX} y2={y} stroke="currentColor" strokeWidth={1} />
            );
          })}
        </g>

        {/* Draw each line */}
        {displayLines.map((line) => {
          // Step interpolation: values change instantaneously in the game (e.g. $0 → $50
          // at t=100), so hold the previous value until the new clock, then jump vertically.
          const pathData = line.points
            .map((point, index) => {
              const x = getX(point.clock);
              const y = getY(point.value);
              if (index === 0) return `M ${x} ${y}`;
              const prevY = getY(line.points[index - 1].value);
              return `L ${x} ${prevY} L ${x} ${y}`;
            })
            .join(" ");

          // Extend line to the end of the chart
          const lastPoint = line.points[line.points.length - 1];
          const lastY = getY(lastPoint.value);
          const extendedPathData = `${pathData} L ${chartEndX} ${lastY}`;

          const adjustedLabelY = labelPositions[line.id];

          return (
            <g key={line.id}>
              {/* Unified halo behind every line — soft glow opposite the bg. */}
              <path
                d={extendedPathData}
                fill="none"
                stroke={haloColor}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#sparkline-soften)"
                opacity={HALO_OPACITY}
              />
              <path
                d={extendedPathData}
                fill="none"
                stroke={line.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Connector line from end point to label if position was adjusted */}
              {Math.abs(adjustedLabelY - lastY) > 2 && (
                <line
                  x1={chartEndX}
                  y1={lastY}
                  x2={chartEndX + 8}
                  y2={adjustedLabelY}
                  stroke={line.color}
                  strokeWidth={1}
                  strokeDasharray="2,2"
                  opacity={0.5}
                />
              )}

              {/* Icon at the end if available */}
              {line.icon && (
                <g transform={`translate(${chartEndX + 10}, ${adjustedLabelY - iconSize / 2})`}>
                  <foreignObject width={iconSize} height={iconSize}>
                    <img
                      src={line.icon}
                      style={{
                        width: iconSize,
                        height: iconSize,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    />
                  </foreignObject>
                </g>
              )}

              {/* Final value label at the adjusted position */}
              <g transform={`translate(${chartEndX + (line.icon ? 30 : 10)}, ${adjustedLabelY})`}>
                <text
                  fontSize={20}
                  fontWeight="bold"
                  dominantBaseline="middle"
                  fill={haloColor}
                  stroke={haloColor}
                  strokeWidth={5}
                  filter="url(#sparkline-soften)"
                  opacity={HALO_OPACITY}
                >
                  {line.finalValue}
                </text>
                <text fill={line.color} fontSize={20} fontWeight="bold" dominantBaseline="middle">
                  {line.finalValue}
                </text>
              </g>

              {/* End point marker halo + dot */}
              <circle
                cx={chartEndX}
                cy={lastY}
                r={6}
                fill={haloColor}
                filter="url(#sparkline-soften)"
                opacity={HALO_OPACITY}
              />
              <circle cx={chartEndX} cy={lastY} r={3} fill={line.color} />
            </g>
          );
        })}

        {/* Axes */}
        <g opacity={0.3}>
          {/* Y axis */}
          <line x1={0} y1={0} x2={0} y2={chartHeight} stroke="currentColor" strokeWidth={1} />
          {/* X axis */}
          <line x1={0} y1={chartHeight} x2={chartEndX} y2={chartHeight} stroke="currentColor" strokeWidth={1} />
        </g>
      </svg>
    </Box>
  );
}

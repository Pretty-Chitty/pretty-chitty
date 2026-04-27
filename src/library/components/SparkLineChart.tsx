import React, { useMemo } from "react";
import { Box, Typography } from "@mui/material";
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

function hexToLinearRgb(color: string): { r: number; g: number; b: number } {
  const hex = color.replace("#", "");
  const toLin = (n: number) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return {
    r: toLin(parseInt(hex.slice(0, 2), 16)),
    g: toLin(parseInt(hex.slice(2, 4), 16)),
    b: toLin(parseInt(hex.slice(4, 6), 16)),
  };
}

function getColorLuminance(color: string): number {
  const { r, g, b } = hexToLinearRgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Convert sRGB hex → CIE Lab (D65), so we can measure perceptual distance.
function hexToLab(color: string): { L: number; a: number; b: number } {
  const { r, g, b } = hexToLinearRgb(color);
  const X = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const Y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const Z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// Perceptual contrast: a stroke is only needed if both luminance AND hue/chroma
// are too close to distinguish. Pure red vs pure green have similar luminance
// but enormous Lab distance, so they should pass without an outline.
function hasGoodContrast(color1: string, color2: string): boolean {
  const lum1 = getColorLuminance(color1);
  const lum2 = getColorLuminance(color2);
  const lumRatio = (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
  if (lumRatio >= 3) return true;

  const lab1 = hexToLab(color1);
  const lab2 = hexToLab(color2);
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  const deltaE = Math.sqrt(dL * dL + da * da + db * db);
  return deltaE >= 35;
}

// The halo has to separate the line from BOTH the background and the line color
// itself — a white halo around a light-teal line on a dark-teal bg merges into
// the line and reads as fuzz. Pick black or white by whichever gives the higher
// minimum WCAG contrast against line and bg simultaneously.
function getStrokeColor(lineColor: string, backgroundColor: string): string {
  const lineLum = getColorLuminance(lineColor);
  const bgLum = getColorLuminance(backgroundColor);
  const blackMin = Math.min((lineLum + 0.05) / 0.05, (bgLum + 0.05) / 0.05);
  const whiteMin = Math.min(1.05 / (lineLum + 0.05), 1.05 / (bgLum + 0.05));
  return blackMin >= whiteMin ? "#000000" : "#ffffff";
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

  // If any line needs a halo, give one to all of them so the chart reads
  // consistently — singling out one line with an outline looks arbitrary.
  const anyNeedsStroke = lines.some((line) => !hasGoodContrast(line.color, backgroundColor));

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
        {lines.map((line) => {
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

          // All lines get the same halo treatment if any line needs one — picked
          // per line so each gets the right black/white for its own color.
          const needsStroke = anyNeedsStroke;
          const strokeColor = needsStroke ? getStrokeColor(line.color, backgroundColor) : undefined;

          const adjustedLabelY = labelPositions[line.id];

          return (
            <g key={line.id}>
              {/* Line with optional stroke for contrast */}
              {needsStroke && (
                <path
                  d={extendedPathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#sparkline-soften)"
                  opacity={HALO_OPACITY}
                />
              )}
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
                {needsStroke && (
                  <text
                    fontSize={20}
                    fontWeight="bold"
                    dominantBaseline="middle"
                    fill={strokeColor}
                    stroke={strokeColor}
                    strokeWidth={5}
                    filter="url(#sparkline-soften)"
                    opacity={HALO_OPACITY}
                  >
                    {line.finalValue}
                  </text>
                )}
                <text fill={line.color} fontSize={20} fontWeight="bold" dominantBaseline="middle">
                  {line.finalValue}
                </text>
              </g>

              {/* End point marker */}
              {needsStroke && (
                <circle
                  cx={chartEndX}
                  cy={lastY}
                  r={6}
                  fill={strokeColor}
                  filter="url(#sparkline-soften)"
                  opacity={HALO_OPACITY}
                />
              )}
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

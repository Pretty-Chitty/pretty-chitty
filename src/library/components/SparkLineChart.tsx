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

// Helper function to calculate color contrast
function getColorLuminance(color: string): number {
  // Convert hex to RGB
  const hex = color.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  // Calculate relative luminance
  const [rs, gs, bs] = [r, g, b].map((c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Check if two colors have enough contrast
function hasGoodContrast(color1: string, color2: string): boolean {
  const lum1 = getColorLuminance(color1);
  const lum2 = getColorLuminance(color2);
  const ratio = (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
  return ratio >= 3; // WCAG AA for large text
}

// Get appropriate stroke color for contrast
function getStrokeColor(lineColor: string, backgroundColor: string): string {
  const lineLum = getColorLuminance(lineColor);
  return lineLum > 0.5 ? "#000000" : "#ffffff";
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
          // Create path for the line
          const pathData = line.points
            .map((point, index) => {
              const x = getX(point.clock);
              const y = getY(point.value);
              return `${index === 0 ? "M" : "L"} ${x} ${y}`;
            })
            .join(" ");

          // Extend line to the end of the chart
          const lastPoint = line.points[line.points.length - 1];
          const lastY = getY(lastPoint.value);
          const extendedPathData = `${pathData} L ${chartEndX} ${lastY}`;

          // Check contrast and add stroke if needed
          const needsStroke = !hasGoodContrast(line.color, backgroundColor);
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
                  strokeWidth={4.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.8}
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
                    strokeWidth={3}
                  >
                    {line.finalValue}
                  </text>
                )}
                <text fill={line.color} fontSize={20} fontWeight="bold" dominantBaseline="middle">
                  {line.finalValue}
                </text>
              </g>

              {/* End point marker */}
              {needsStroke && <circle cx={chartEndX} cy={lastY} r={5} fill={strokeColor} opacity={0.8} />}
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

import React, { useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { chartColors, spacing, textStyles, typography } from "../../../theme";
import { formatNumber, niceScale } from "./scale";

export type LineSeries = { label: string; values: (number | null)[]; color?: string; dashed?: boolean };

type LineChartProps = {
  series: LineSeries[];
  /** One label per point (e.g. bucket start time); only a few are drawn. */
  xLabels: string[];
  accessibilityLabel: string;
  height?: number;
  domainMax?: number;
  /** Lower end of the y axis (default 0); values below it are drawn on the axis. */
  domainMin?: number;
  formatValue?: (value: number) => string;
};

// SVG <text> does not inherit the React Native font: pass the theme caption size (12, the minimum) and family.
const FONT = typography.caption.fontSize;
const FAMILY = typography.caption.fontFamily;

/** Small dependency-free line chart drawn with react-native-svg. Null values leave a gap (owner: Huy). */
export function LineChart({ series, xLabels, accessibilityLabel, height = 190, domainMax, domainMin, formatValue = formatNumber }: LineChartProps): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width));
  const all = series.flatMap((item) => item.values).filter((value): value is number => typeof value === "number");
  const scale = niceScale(Math.max(0, ...all), { domainMax, domainMin });
  const points = Math.max(1, ...series.map((item) => item.values.length));

  const axisWidth = Math.max(...scale.ticks.map((tick) => formatValue(tick).length)) * 7 + 8;
  const top = 10;
  const bottom = 22;
  const plotWidth = Math.max(1, width - axisWidth - 8);
  const plotHeight = height - top - bottom;
  const x = (index: number) => axisWidth + (points === 1 ? plotWidth / 2 : (index / (points - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - ((Math.max(value, scale.min) - scale.min) / (scale.max - scale.min)) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(points / Math.max(2, Math.floor(plotWidth / 70))));

  return (
    <View style={{ gap: spacing.sm }}>
      <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ height, width: "100%" }}>
        {width > 0 ? (
          <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {scale.ticks.map((tick) => (
              <G key={tick}>
                <Line x1={axisWidth} x2={width} y1={y(tick)} y2={y(tick)} stroke={chartColors.grid} strokeWidth={1} />
                <SvgText fontFamily={FAMILY} x={axisWidth - 6} y={y(tick) + 4} fontSize={FONT} fill={chartColors.axis} textAnchor="end">{formatValue(tick)}</SvgText>
              </G>
            ))}
            {xLabels.map((label, index) => (index % labelEvery === 0 || index === points - 1) && (index === points - 1 || points - 1 - index >= labelEvery / 2) ? (
              <SvgText fontFamily={FAMILY} key={`x-${index}`} x={x(index)} y={height - 6} fontSize={FONT} fill={chartColors.axis} textAnchor={index === 0 ? "start" : index === points - 1 ? "end" : "middle"}>{label}</SvgText>
            ) : null)}
            {series.map((item, seriesIndex) => {
              const color = item.color ?? chartColors.series[seriesIndex % chartColors.series.length];
              // Split into runs of consecutive values so gaps (null) are not bridged.
              let d = "";
              let drawing = false;
              item.values.forEach((value, index) => {
                if (typeof value !== "number") { drawing = false; return; }
                d += `${drawing ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
                drawing = true;
              });
              const isolated = item.values.map((value, index) => typeof value === "number"
                && typeof item.values[index - 1] !== "number" && typeof item.values[index + 1] !== "number" ? index : -1).filter((index) => index >= 0);
              return (
                <G key={item.label}>
                  {d ? <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeDasharray={item.dashed ? "5,4" : undefined} strokeLinejoin="round" strokeLinecap="round" /> : null}
                  {isolated.map((index) => <Circle key={index} cx={x(index)} cy={y(item.values[index] as number)} r={3} fill={color} />)}
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>
      {series.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {series.map((item, index) => (
            <View key={item.label} style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <View style={{ backgroundColor: item.color ?? chartColors.series[index % chartColors.series.length], borderRadius: 2, height: item.dashed ? 2 : 3, width: 18 }} />
              <Text style={textStyles.caption}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

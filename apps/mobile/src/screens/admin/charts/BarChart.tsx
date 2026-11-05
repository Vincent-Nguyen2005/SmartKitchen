import React, { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { chartColors } from "../../../theme";
import { chartFontFamily, formatNumber, niceScale, truncate } from "./scale";

export type BarDatum = { label: string; value: number | null; color?: string };

type BarChartProps = {
  data: BarDatum[];
  /** Screen-reader summary of the data; the SVG itself is hidden from accessibility. */
  accessibilityLabel: string;
  /** "vertical" bars with labels below, or "horizontal" rows (better for many / long labels). */
  orientation?: "vertical" | "horizontal";
  height?: number;
  integer?: boolean;
  /** Fixed axis maximum, e.g. 100 for percentages. */
  domainMax?: number;
  formatValue?: (value: number) => string;
};

const FONT = 11;
const ROW = 28;

/** Small dependency-free bar chart drawn with react-native-svg (owner: Huy). */
export function BarChart({ data, accessibilityLabel, orientation = "vertical", height = 180, integer, domainMax, formatValue = formatNumber }: BarChartProps): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width));
  const values = data.map((datum) => datum.value ?? 0);
  const scale = niceScale(Math.max(0, ...values), { integer, domainMax });
  const chartHeight = orientation === "horizontal" ? data.length * ROW + 22 : height;

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ height: chartHeight, width: "100%" }}>
      {width > 0 ? (
        <Svg width={width} height={chartHeight} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {orientation === "horizontal"
            ? <Horizontal data={data} width={width} scale={scale} formatValue={formatValue} />
            : <Vertical data={data} width={width} height={chartHeight} scale={scale} formatValue={formatValue} />}
        </Svg>
      ) : null}
    </View>
  );
}

type PartProps = { data: BarDatum[]; width: number; scale: ReturnType<typeof niceScale>; formatValue: (value: number) => string };

function Vertical({ data, width, height, scale, formatValue }: PartProps & { height: number }) {
  const axisWidth = Math.max(...scale.ticks.map((tick) => formatValue(tick).length)) * 7 + 8;
  const top = 16;
  const bottom = 22;
  const plotWidth = Math.max(1, width - axisWidth - 4);
  const plotHeight = height - top - bottom;
  const slot = plotWidth / Math.max(1, data.length);
  const barWidth = Math.min(44, slot * 0.6);
  const y = (value: number) => top + plotHeight - (value / scale.max) * plotHeight;
  const maxChars = Math.max(3, Math.floor(slot / 6.5));
  return (
    <G>
      {scale.ticks.map((tick) => (
        <G key={tick}>
          <Line x1={axisWidth} x2={width} y1={y(tick)} y2={y(tick)} stroke={chartColors.grid} strokeWidth={1} />
          <SvgText fontFamily={chartFontFamily} x={axisWidth - 6} y={y(tick) + 4} fontSize={FONT} fill={chartColors.axis} textAnchor="end">{formatValue(tick)}</SvgText>
        </G>
      ))}
      {data.map((datum, index) => {
        const value = datum.value ?? 0;
        const cx = axisWidth + slot * index + slot / 2;
        const barTop = y(value);
        return (
          <G key={datum.label}>
            <Rect x={cx - barWidth / 2} y={barTop} width={barWidth} height={Math.max(0, top + plotHeight - barTop)} rx={4} fill={datum.color ?? chartColors.series[0]} />
            <SvgText fontFamily={chartFontFamily} x={cx} y={barTop - 4} fontSize={FONT} fontWeight="600" fill={chartColors.label} textAnchor="middle">{datum.value === null ? "–" : formatValue(value)}</SvgText>
            <SvgText fontFamily={chartFontFamily} x={cx} y={height - 6} fontSize={FONT} fill={chartColors.axis} textAnchor="middle">{truncate(datum.label, maxChars)}</SvgText>
          </G>
        );
      })}
    </G>
  );
}

function Horizontal({ data, width, scale, formatValue }: PartProps) {
  const labelWidth = Math.min(150, Math.max(72, Math.round(width * 0.38)));
  const valueWidth = 48;
  const plotLeft = labelWidth + 6;
  const plotWidth = Math.max(1, width - plotLeft - valueWidth);
  const x = (value: number) => plotLeft + (value / scale.max) * plotWidth;
  const maxChars = Math.max(6, Math.floor(labelWidth / 6.3));
  const axisY = data.length * ROW + 4;
  return (
    <G>
      {scale.ticks.map((tick) => (
        <G key={tick}>
          <Line x1={x(tick)} x2={x(tick)} y1={0} y2={axisY} stroke={chartColors.grid} strokeWidth={1} />
          <SvgText fontFamily={chartFontFamily} x={x(tick)} y={axisY + 14} fontSize={FONT} fill={chartColors.axis} textAnchor="middle">{formatValue(tick)}</SvgText>
        </G>
      ))}
      {data.map((datum, index) => {
        const rowY = index * ROW;
        const value = datum.value ?? 0;
        return (
          <G key={datum.label}>
            <SvgText fontFamily={chartFontFamily} x={labelWidth} y={rowY + ROW / 2 + 4} fontSize={FONT} fill={chartColors.label} textAnchor="end">{truncate(datum.label, maxChars)}</SvgText>
            <Rect x={plotLeft} y={rowY + 6} width={Math.max(datum.value === null ? 0 : 2, x(value) - plotLeft)} height={ROW - 12} rx={3} fill={datum.color ?? chartColors.series[0]} />
            <SvgText fontFamily={chartFontFamily} x={width - 2} y={rowY + ROW / 2 + 4} fontSize={FONT} fontWeight="600" fill={chartColors.label} textAnchor="end">{datum.value === null ? "–" : formatValue(value)}</SvgText>
          </G>
        );
      })}
    </G>
  );
}

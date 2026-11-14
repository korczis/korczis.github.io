// The ECharts the site ships: only what static/js/viz/ uses, drawn on canvas -
//   skillset.js   a sunburst with a tooltip;
//   graph.js      a force graph with a category legend and labels that hide when they overlap.
// Every visual turns on aria (a description of the chart from its box's aria-label).
// scripts/vendor.mjs bundles it into static/js/vendor/echarts.min.js as the same global `echarts`
// the full build defines; add a chart or component here when a visual needs it, and
// check-viz-layer.mjs fails a visual whose series type is missing.
import * as echarts from 'echarts/core';
import { GraphChart, SunburstChart } from 'echarts/charts';
import { AriaComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([GraphChart, SunburstChart, AriaComponent, LegendComponent, TooltipComponent, LabelLayout, CanvasRenderer]);
globalThis.echarts = echarts;

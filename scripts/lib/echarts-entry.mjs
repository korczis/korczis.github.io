// The ECharts the site ships: only what static/js/viz/ uses, drawn on canvas -
//   skillset.js   a sunburst with a tooltip;
//   graph.js      a force graph with a category legend and labels that hide when they overlap;
//   languages.js  horizontal bars on a grid, with a title naming the years counted;
//   experience.js a sankey of engagements by capability, with a tooltip.
// Every visual turns on aria (a description of the chart from its box's aria-label).
// scripts/vendor.mjs bundles it into static/js/vendor/echarts.min.js as the same global `echarts`
// the full build defines; add a chart or component here when a visual needs it, and
// check-viz-layer.mjs fails a visual whose series type is missing.
import * as echarts from 'echarts/core';
import { BarChart, GraphChart, SankeyChart, SunburstChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  GraphChart,
  SankeyChart,
  SunburstChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer,
]);
globalThis.echarts = echarts;

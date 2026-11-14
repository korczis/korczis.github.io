// The ECharts the site ships: only what static/js/viz/ uses (skillset.js: a sunburst with a
// tooltip; experience.js: a sankey with a tooltip; both drawn on canvas). scripts/vendor.mjs
// bundles it into static/js/vendor/echarts.min.js as the same global `echarts` the full build
// defines; add a chart or component here when a visual needs it, and check-viz-layer.mjs fails a
// visual whose series type is missing.
import * as echarts from 'echarts/core';
import { SunburstChart } from 'echarts/charts';
import { SankeyChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([SunburstChart, SankeyChart, TooltipComponent, CanvasRenderer]);
globalThis.echarts = echarts;

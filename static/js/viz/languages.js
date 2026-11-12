// Primary language of every public, non-fork repository (Chart.js), from data/github.json. One
// series, one colour: the bars compare counts, so they do not need a legend or a rainbow.
KorczisHub.viz('languages', {
  lib: 'chartjs',
  mount(box, source, { palette }) {
    const canvas = box.querySelector('canvas');
    const labels = source.map((entry) => entry.name);
    const counts = source.map((entry) => entry.repos);

    const config = () => {
      const c = palette();
      return {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Repositories',
            data: counts,
            backgroundColor: labels.map((name) => (name === 'Other' ? c.grid : c.primary)),
            borderRadius: 4,
            maxBarThickness: 18,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: KorczisHub.reducedMotion() ? false : { duration: 400 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: c.surface,
              borderColor: c.grid,
              borderWidth: 1,
              titleColor: c.strong,
              bodyColor: c.text,
              callbacks: { label: (item) => ` ${item.raw} repositories` },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: c.grid },
              border: { display: false },
              ticks: { color: c.muted, precision: 0, font: { family: c.font, size: 11 } },
            },
            y: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: c.text, font: { family: c.font, size: 12 } },
            },
          },
        },
      };
    };

    let chart = new Chart(canvas, config());
    return {
      update() {
        chart.destroy();
        chart = new Chart(canvas, config());
      },
      destroy() {
        chart.destroy();
      },
    };
  },
});

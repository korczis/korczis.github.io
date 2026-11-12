// Primary language of every public, non-fork repository (Chart.js), from data/github.json. One
// series, one colour: the bars compare counts, so they do not need a legend or a rainbow. A bar
// opens the repository index filtered to its language.
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
            hoverBackgroundColor: labels.map((name) => (name === 'Other' ? c.grid : c.ramp[3])),
            borderRadius: 4,
            maxBarThickness: 18,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: KorczisHub.reducedMotion() ? false : { duration: 400 },
          // A bar is a link: open every repository in that language.
          onClick: (_event, elements) => {
            const name = elements[0] && labels[elements[0].index];
            if (name && name !== 'Other') window.location.href = `${KorczisHub.base}repositories/?language=${encodeURIComponent(name)}`;
          },
          onHover: (event, elements) => {
            event.native.target.style.cursor = elements.length && labels[elements[0].index] !== 'Other' ? 'pointer' : 'default';
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: c.surface,
              borderColor: c.grid,
              borderWidth: 1,
              titleColor: c.strong,
              bodyColor: c.text,
              callbacks: { label: (item) => ` ${item.raw} repositories`, footer: () => 'Click to open them' },
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

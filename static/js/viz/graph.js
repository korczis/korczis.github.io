// Ecosystem graph (Cytoscape.js): projects, the technologies they are built with, and which of them
// Majordomus supervises. "Supervised" is measured (a .ai/manifest.yaml on the default branch, see
// scripts/fetch-github.mjs), never typed by hand. Tap a project to open it in the catalogue.
KorczisHub.viz('graph', {
  lib: 'cytoscape',
  mount(box, source, { palette }) {
    const { projects, measured } = source;
    const HUB = 'prismatic-majordomus';
    const elements = [];
    const techs = new Map();

    for (const project of projects) {
      const facts = measured[project.repo] || {};
      elements.push({
        data: { id: `p:${project.repo}`, label: project.name, kind: 'project', repo: project.repo },
        classes: [project.repo === HUB ? 'hub' : '', facts.live ? 'live' : ''].join(' '),
      });
      for (const tech of project.stack) {
        techs.set(tech, (techs.get(tech) || 0) + 1);
        elements.push({ data: { id: `e:${project.repo}:${tech}`, source: `p:${project.repo}`, target: `t:${tech}`, kind: 'uses' } });
      }
      if (facts.supervised && project.repo !== HUB) {
        elements.push({ data: { id: `s:${project.repo}`, source: `p:${HUB}`, target: `p:${project.repo}`, kind: 'supervises' } });
      }
    }
    for (const [tech, uses] of techs) {
      elements.push({ data: { id: `t:${tech}`, label: tech, kind: 'tech', uses } });
    }

    const style = () => {
      const c = palette();
      return [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-family': c.font,
            'font-size': 12,
            color: c.text,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-background-color': c.surface,
            'text-background-opacity': 0.85,
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle',
          },
        },
        {
          selector: 'node[kind = "project"]',
          style: { width: 24, height: 24, 'background-color': c.primary, 'font-weight': 600, 'font-size': 13, color: c.strong },
        },
        {
          selector: 'node.hub',
          style: { width: 38, height: 38, 'border-width': 5, 'border-color': c.primarySoft, 'font-size': 15 },
        },
        {
          selector: 'node[kind = "tech"]',
          style: {
            width: 'mapData(uses, 1, 5, 10, 18)',
            height: 'mapData(uses, 1, 5, 10, 18)',
            'background-color': c.surface,
            'border-width': 2,
            'border-color': c.muted,
          },
        },
        { selector: 'edge', style: { width: 1, 'line-color': c.grid, 'curve-style': 'bezier' } },
        {
          selector: 'edge[kind = "supervises"]',
          style: {
            width: 1.75,
            'line-color': c.primary,
            'line-style': 'dashed',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': c.primary,
            'arrow-scale': 0.8,
          },
        },
        { selector: '.faded', style: { opacity: 0.18 } },
      ];
    };

    const cy = cytoscape({
      container: box.querySelector('[data-canvas]') || box,
      elements,
      style: style(),
      layout: {
        name: 'cose', animate: false, randomize: false, padding: 16,
        nodeRepulsion: 7000, idealEdgeLength: 64, nodeOverlap: 16, componentSpacing: 40, gravity: 1.1, numIter: 2500,
        nodeDimensionsIncludeLabels: true,
      },
      userZoomingEnabled: false,
      boxSelectionEnabled: false,
      autoungrabify: false,
      minZoom: 0.4,
      maxZoom: 2.5,
    });

    cy.on('mouseover tapstart', 'node', (event) => {
      const neighbourhood = event.target.closedNeighborhood();
      cy.elements().not(neighbourhood).addClass('faded');
    });
    cy.on('mouseout tapend', 'node', () => cy.elements().removeClass('faded'));
    cy.on('tap', 'node[kind = "project"]', (event) => {
      window.location.href = `${KorczisHub.base}projects/?project=${event.target.data('repo')}`;
    });
    // A technology opens the repository index searched for it.
    cy.on('tap', 'node[kind = "tech"]', (event) => {
      window.location.href = `${KorczisHub.base}repositories/?q=${encodeURIComponent(event.target.data('label').toLowerCase())}`;
    });
    cy.on('mouseover', 'node', () => { box.style.cursor = 'pointer'; });
    cy.on('mouseout', 'node', () => { box.style.cursor = ''; });

    const resize = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 16);
    });
    resize.observe(box);

    box.dataset.nodes = String(cy.nodes().length);

    return {
      update() {
        cy.style(style());
      },
      destroy() {
        resize.disconnect();
        cy.destroy();
      },
    };
  },
});

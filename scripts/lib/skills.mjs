// The evidence behind every language and technology the site names: which of the owner's public
// repositories use it and how (the main language, a measured share of the code, a curated stack, a
// topic), across which years and categories, with which live sites, and in which anonymised client
// engagements (data/experience.json, mined; never a client's name). One function, read by
// scripts/build-glossary.mjs (the term pages, their articles and data/skills.json) and by
// scripts/check-glossary.mjs (every measured name has a term). Nothing here is typed by hand.
import { readJson, readToml, slug } from './derive.mjs';

// The smallest measured share (percent of a repository's code) that counts as using a language;
// below it a language is a stray file (a build script, a vendored snippet), not evidence.
export const MIN_SHARE = 1;

// Every name the data uses for a language or technology, with where it comes from: the coverage
// a glossary must give a page to (rule project.everything-interlinked).
export function measuredNames({ index, recent, catalogue, experience }) {
  const names = new Map();
  const add = (name, from) => { if (name) names.set(name, [...new Set([...(names.get(name) ?? []), from])]); };
  for (const l of index.languages) add(l.name, 'data/index.json languages');
  for (const r of recent.repos) for (const l of r.languages) if (l.share >= MIN_SHARE) add(l.name, `data/recent.json ${r.name}`);
  for (const p of catalogue.projects) for (const s of p.stack ?? []) add(s, `data/projects.toml ${p.repo}`);
  for (const e of experience.engagements) for (const s of e.technologies) add(s, `data/experience.json ${e.id}`);
  return names;
}

// Terms a page names through data its template renders rather than through its front matter: the
// landing page's experience section (templates/partials/experience.html) links every technology of
// the mined engagements to its term. Page (Zola path without the language) -> term ids.
export function renderedTerms(g, { experience }) {
  const ids = new Set(experience.engagements.flatMap((e) => e.technologies).map((n) => g.byName.get(n.toLowerCase())).filter(Boolean));
  return new Map([['_index', [...ids].sort()]]);
}

export function loadSources() {
  return {
    index: readJson('data/index.json'),
    recent: readJson('data/recent.json'),
    catalogue: readToml('data/projects.toml'),
    experience: readJson('data/experience.json'),
  };
}

const year = (iso) => (iso ? Number(iso.slice(0, 4)) : null);

// term id -> { repos, counts, years, categories, engagements }, for every language and technology
// term (concepts have no code to measure).
export function skillEvidence(g, { index, recent, catalogue, experience }) {
  const termOf = (name) => g.byName.get(String(name).toLowerCase()) ?? null;
  const recentOf = new Map(recent.repos.map((r) => [r.name, r]));
  const curatedOf = new Map(catalogue.projects.map((p) => [p.repo, p]));
  const out = new Map(g.terms.filter((t) => t.kind !== 'concept').map((t) => [t.id, { repos: new Map(), engagements: [] }]));

  for (const r of index.repos) {
    const rc = recentOf.get(r.name);
    const curated = curatedOf.get(r.name);
    // How the repository uses each term: the reasons, the measured share where one exists.
    const uses = new Map();
    const use = (name, via, share = null) => {
      const id = termOf(name);
      if (!id || !out.has(id)) return;
      const u = uses.get(id) ?? { via: [], share: null };
      if (!u.via.includes(via)) u.via.push(via);
      if (share !== null) u.share = Math.max(u.share ?? 0, share);
      uses.set(id, u);
    };
    if (r.language) use(r.language, 'primary');
    for (const l of rc?.languages ?? []) if (l.share >= MIN_SHARE) use(l.name, 'code', l.share);
    for (const s of curated?.stack ?? []) use(s, 'stack');
    for (const tp of r.topics ?? []) use(tp, 'topic');
    if (!uses.size) continue;
    const all = [...uses.keys()];
    for (const [id, u] of uses) {
      out.get(id).repos.set(r.name, {
        name: r.name,
        title: curated?.name ?? r.name,
        url: r.hosts.github ?? r.hosts.gitlab,
        work: Boolean(rc),
        // The work page's slug (scripts/build-work.mjs names it so), when the repository has one.
        slug: rc ? slug(r.name) : null,
        site: r.site ?? null,
        category: r.category,
        description: r.description ?? null,
        summary: curated?.summary ?? null,
        summary_cs: curated?.summary_cs ?? null,
        created: r.created_at.slice(0, 10),
        pushed: r.pushed_at.slice(0, 10),
        primary: u.via.includes('primary'),
        share: u.share,
        via: u.via,
        supervised: Boolean(r.supervised),
        // Every term the repository uses (this one too), by name: the edges of the reference graph.
        uses: all.map((x) => g.byId.get(x).term),
      });
    }
  }

  for (const e of experience.engagements) {
    for (const name of e.technologies) {
      const id = termOf(name);
      if (!id || !out.has(id)) continue;
      // A use case, not a record: the sector, the roles and what was solved (the capability's
      // principle and intent, data/experience-rules.toml). No name, no date, no number (NDA, ADR 0006).
      out.get(id).engagements.push({
        id: e.id,
        sector: e.sector,
        roles: e.roles,
        capabilities: e.capabilities.slice(0, 4).map((c) => c.key),
      });
    }
  }

  const result = {};
  for (const [id, ev] of out) {
    const repos = [...ev.repos.values()].sort((a, b) => b.pushed.localeCompare(a.pushed) || a.name.localeCompare(b.name));
    const categories = {};
    for (const r of repos) categories[r.category] = (categories[r.category] ?? 0) + 1;
    const years = repos.flatMap((r) => [year(r.created), year(r.pushed)]).filter(Boolean);
    result[id] = {
      name: g.byId.get(id).term,
      kind: g.byId.get(id).kind,
      counts: {
        repos: repos.length,
        primary: repos.filter((r) => r.primary).length,
        sites: repos.filter((r) => r.site).length,
        work: repos.filter((r) => r.work).length,
        engagements: ev.engagements.length,
      },
      first: years.length ? Math.min(...years) : null,
      last: years.length ? Math.max(...years) : null,
      categories: Object.entries(categories).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, n]) => ({ key, n })),
      repos,
      engagements: ev.engagements,
    };
  }
  return result;
}

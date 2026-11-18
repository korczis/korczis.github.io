// What the owner offers (data/services.toml: the words only) and the skills it draws on (the
// capabilities of data/experience-rules.toml), with every piece of evidence derived: the public
// repositories that show a skill (inferred from their own words, name, description, topics, README
// and recent commits, by the experience inference with its public threshold, the same engine and
// keywords that infer the experience section; plus data/experience.json public_work), the client
// engagements reduced to use cases (sector and roles, never a name, date or number: ADR 0006),
// and the languages and technologies all of these use (scripts/lib/skills.mjs). Read by
// scripts/build-services.mjs (the pages, their articles and data/services.json) and its gate.
import { readToml, slug } from './derive.mjs';
import { infer } from './experience.mjs';
import { skillEvidence } from './skills.mjs';

export const loadServices = () => readToml('data/services.toml');


const rank = (map, g) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, n]) => ({ id, name: g.byId.get(id).term, n }));

export function serviceEvidence(g, sources, services = loadServices()) {
  const rules = readToml('data/experience-rules.toml');
  const { index, recent, catalogue, experience } = sources;
  const recentOf = new Set(recent.repos.map((r) => r.name));
  const curatedOf = new Map(catalogue.projects.map((p) => [p.repo, p]));
  const terms = skillEvidence(g, sources);
  // repository -> the language and technology terms it uses (the inverse of the term evidence).
  const termsOf = new Map();
  for (const [id, ev] of Object.entries(terms)) for (const r of ev.repos) termsOf.set(r.name, [...(termsOf.get(r.name) ?? []), id]);
  const repoOf = new Map(index.repos.map((r) => [r.name, r]));
  const servicesOf = (cap) => services.services.filter((s) => s.skills.includes(cap)).map((s) => s.id);

  // Every public repository read for the capabilities its own words show (the experience
  // inference at its public threshold): capability -> [{ name, score }].
  const shown = new Map();
  const rcOf = new Map(recent.repos.map((r) => [r.name, r]));
  for (const r of index.repos) {
    const rc = rcOf.get(r.name);
    const p = curatedOf.get(r.name);
    const found = infer(rules, {
      commits: (rc?.commits ?? []).map((c) => c.message),
      headings: [r.name, r.description, rc?.readme, p?.tagline, p?.summary, ...(r.topics ?? [])].filter(Boolean),
      paths: [],
    }, rules.inference.public_threshold, 0);
    for (const f of found) shown.set(f.key, [...(shown.get(f.key) ?? []), { name: r.name, score: f.score }]);
  }
  for (const [cap, names] of Object.entries(experience.public_work ?? {})) {
    for (const name of names) if (!(shown.get(cap) ?? []).some((x) => x.name === name)) shown.set(cap, [...(shown.get(cap) ?? []), { name, score: 0 }]);
  }

  const skills = {};
  for (const [cap, c] of Object.entries(rules.capabilities)) {
    // Public work: the repositories whose own words show the skill, the strongest first.
    const repos = (shown.get(cap) ?? []).filter((x) => repoOf.has(x.name)).map(({ name, score }) => {
      const r = repoOf.get(name);
      return {
        name,
        title: curatedOf.get(name)?.name ?? name,
        how: 'words',
        score,
        // The work page's slug (scripts/build-work.mjs names it so), when the repository has one.
        slug: recentOf.has(name) ? slug(name) : null,
        url: r.hosts.github ?? r.hosts.gitlab,
        description: r.description ?? null,
        category: r.category,
        site: r.site ?? null,
        pushed: r.pushed_at.slice(0, 10),
      };
    }).sort((a, b) => b.score - a.score || b.pushed.localeCompare(a.pushed));
    const engagements = experience.engagements
      .filter((e) => e.capabilities.some((x) => x.key === cap))
      .map((e) => ({ id: e.id, sector: e.sector, roles: e.roles, with: e.capabilities.map((x) => x.key).filter((k) => k !== cap).slice(0, 4) }));
    const tech = new Map();
    const count = (id) => { if (id && terms[id]) tech.set(id, (tech.get(id) ?? 0) + 1); };
    for (const r of repos) for (const id of termsOf.get(r.name) ?? []) count(id);
    for (const e of experience.engagements.filter((x) => x.capabilities.some((y) => y.key === cap))) {
      for (const n of e.technologies) count(g.byName.get(n.toLowerCase()));
    }
    skills[cap] = {
      domain: c.domain,
      term: c.term ?? null,
      services: servicesOf(cap),
      repos,
      engagements,
      technologies: rank(tech, g).slice(0, 16),
    };
  }

  const out = {};
  for (const s of services.services) {
    const repos = new Map();
    const tech = new Map();
    const engagements = new Map();
    for (const cap of s.skills) {
      const k = skills[cap];
      if (!k) continue;
      for (const r of k.repos) if (!repos.has(r.name) || repos.get(r.name).score < r.score) repos.set(r.name, { ...r, skill: cap });
      for (const t of k.technologies) tech.set(t.id, (tech.get(t.id) ?? 0) + t.n);
      for (const e of k.engagements) {
        const known = engagements.get(e.id) ?? { id: e.id, sector: e.sector, roles: e.roles, skills: [] };
        known.skills.push(cap);
        engagements.set(e.id, known);
      }
    }
    // The stack the service is declared to be built with leads; the measured technologies follow.
    const declared = (s.stack ?? []).map((n) => g.byName.get(n.toLowerCase())).filter(Boolean);
    const measured = rank(tech, g).filter((x) => !declared.includes(x.id));
    out[s.id] = {
      stack: declared.map((id) => ({ id, name: g.byId.get(id).term, n: tech.get(id) ?? 0, declared: true })),
      skills: s.skills,
      repos: [...repos.values()].sort((a, b) => b.score - a.score || b.pushed.localeCompare(a.pushed)),
      engagements: [...engagements.values()],
      technologies: measured.slice(0, 16),
    };
  }
  return { services: out, skills };
}

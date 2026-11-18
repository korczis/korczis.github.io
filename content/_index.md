+++
title = "Tomas Korcak"
description = "Tomas Korcak, staff engineer for AI agent infrastructure, Elixir and Rust, open to remote roles and contracts: software that makes AI agents prove their work."
template = "index.html"

[extra]
article_title = "How to read this site"
reading_path = ["work/prismatic-majordomus.md", "stack.md", "interfaces.md", "hire.md", "work/_index.md", "repositories/_index.md"]
terms = ["repository", "commit", "fork", "mirror", "data-visualisation", "d3", "front-matter", "zola", "static-site-generator", "flowbite-pro", "wcag", "json-ld", "open-graph", "ai-agent", "mcp", "orchestration", "audit-trail", "osint", "due-diligence", "elixir", "rust", "apache-echarts"]
seo_title = "Tomas Korcak · Staff engineer, AI agent infrastructure (Elixir, Rust)"
og_title = "Tomas Korcak: staff engineer for AI agent infrastructure."
og_description = "Tools that make AI agents prove what they did, honest instruments in the browser, and knowledge you can check."
og_image = "og/home.png"
schema = "home"
keywords = ["Tomas Korcak", "korczis", "Majordomus", "AI agents", "software engineering", "scientific visualisation", "Brno"]
# The visuals, each with its declared id (its address, ?viz=<id>, and how templates/index.html
# places it in its chapter through viz_ids): the skills, how the repositories are counted and the
# languages over time, the pulse of the last weeks, then the archive.
[[extra.viz]]
id = "skillset"
kind = "skillset"
source = "index.skillset"
title = "home_skillset_title"
lead = "home_skillset_lead"
span = 1
height = "lg"

[[extra.viz]]
id = "provenance"
kind = "provenance"
source = "index.counts"
title = "viz_provenance_title"
lead = "viz_provenance_lead"
span = 3
height = "md"

[[extra.viz]]
id = "stream"
kind = "stream"
source = "index.years"
title = "viz_stream_title"
lead = "viz_stream_lead"
caption = "body_stream_caption"
span = 3
height = "md"

[[extra.viz]]
id = "pulse"
kind = "pulse"
source = "recent.commits"
title = "viz_pulse_title"
lead = "viz_pulse_lead"
span = 3
height = "md"
tone = "night"

[[extra.viz]]
id = "galaxy"
kind = "constellation"
source = "index.repos"
title = "viz_constellation_title"
lead = "viz_constellation_lead"
span = 3
height = "lg"
tone = "night"

[[extra.viz]]
id = "ecosystem"
kind = "graph"
source = "catalogue.graph"
title = "how_the_pieces_connect"
lead = "projects_the_tools_they_use_and"
span = 2
height = "lg"

[[extra.viz]]
id = "spiral"
kind = "spiral"
source = "github.contributions"
title = "viz_spiral_title"
lead = "viz_spiral_lead"
span = 1
height = "lg"

[[extra.viz]]
id = "languages-pack"
kind = "pack"
source = "index.repos"
title = "viz_pack_title"
lead = "viz_pack_lead"
span = 2
height = "lg"
+++
This page is a portfolio arranged as evidence. Its top answers what a hiring team asks first: who Tomas Korcak is, the roles he is hired for and on what terms; everything below it links to where it can be checked. Every number on it comes from a script that measured it: the [repositories](@/glossary/repository.md) on GitHub and GitLab, read through their command-line clients, the contribution calendar, and the date of each project's last [commit](@/glossary/commit.md). Nothing is typed twice, and a check refuses a stale copy.

[Majordomus](@/work/prismatic-majordomus.md) is the flagship. It supervises the [AI agents](@/glossary/ai-agent.md) that write code: one policy for every coding assistant, scoped tasks with a finish contract, and an [audit trail](@/glossary/audit-trail.md) of what each agent did. It is written in [Rust](@/glossary/rust.md), serves its rules over [MCP](@/glossary/mcp.md) and does its [orchestration](@/glossary/orchestration.md) locally, without calling a model. This site runs under it, so the rules and gates the case study counts are the ones that checked this page.

The client work is [due diligence](@/glossary/due-diligence.md), M&A and AI, anonymised under NDA: the engagements are mined from private repositories, and only the capabilities, sectors and scale they show reach the page, counted and never named. Much of it is [OSINT](@/glossary/osint.md) and data work in [Elixir](@/glossary/elixir.md).

The live instruments run in the browser with nothing to install: [Oscilla](@/work/oscilla.md), an acoustic laboratory, and [algoglyph](@/work/algoglyph.md), algorithms and physics drawn as glyphs. Each is checked live before a deploy and links its source.

Who wrote what matters. A [fork](@/glossary/fork.md) or a [mirror](@/glossary/mirror.md) is counted but never shown as Tomas Korcak's work: a repository is original only when he wrote at least half of its commits. Both forges are read and merged by name, so a repository listed on both counts once; the chart of how the repositories are counted shows each step.

Skills are measured, not claimed. A language counts the original repositories written in it, a technology the projects whose stack names it, a capability the client engagements that show it, and every row links its evidence. A span runs from the first public repository to the latest push: it measures public work, not seniority.

The page itself is built from [front matter](@/glossary/front-matter.md) and data by [Zola](@/glossary/zola.md), a [static site generator](@/glossary/static-site-generator.md), styled with [Flowbite Pro](@/glossary/flowbite-pro.md), and audited against [WCAG](@/glossary/wcag.md) AA in both themes before it ships. The pictures are [data visualisation](@/glossary/data-visualisation.md) drawn with [D3.js](@/glossary/d3.md) and [Apache ECharts](@/glossary/apache-echarts.md) from the same measurements: hover a mark to read it, click it to open the work behind it. Machines read the same facts as [JSON-LD](@/glossary/json-ld.md), `llms.txt`, `site.json` and `resume.json`; social networks draw each preview from its [Open Graph](@/glossary/open-graph.md) tags. The roles and terms, with the evidence for each, are on [the hire page](@/hire.md). Every page ends with the concepts it builds on; the [glossary](@/glossary/_index.md) defines each one and cites a source.

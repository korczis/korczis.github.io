+++
title = "Tomas Korcak"
description = "Tomas Korcak, staff engineer for AI agent infrastructure, Elixir and Rust, open to remote roles and contracts: software that makes AI agents prove their work."
template = "index.html"

[extra]
article_title = "How to read this site"
terms = ["repository", "commit", "fork", "mirror", "data-visualisation", "d3", "front-matter", "zola", "static-site-generator", "flowbite-pro", "wcag", "json-ld", "open-graph"]
seo_title = "Tomas Korcak · Staff engineer, AI agent infrastructure (Elixir, Rust)"
og_title = "Tomas Korcak: staff engineer for AI agent infrastructure."
og_description = "Tools that make AI agents prove what they did, honest instruments in the browser, and knowledge you can check."
og_image = "og/home.png"
schema = "home"
keywords = ["Tomas Korcak", "korczis", "Majordomus", "AI agents", "software engineering", "scientific visualisation", "Brno"]
# The first two sit in the home's own rows beside a card each (templates/index.html includes
# viz-grid with viz_from / viz_to); the rest form the art grid.
[[extra.viz]]
kind = "skillset"
source = "index.skillset"
title = "home_skillset_title"
lead = "home_skillset_lead"
span = 2
height = "lg"

[[extra.viz]]
kind = "graph"
source = "catalogue.graph"
title = "how_the_pieces_connect"
lead = "projects_the_tools_they_use_and"
span = 2
height = "lg"

[[extra.viz]]
kind = "constellation"
source = "index.repos"
title = "viz_constellation_title"
lead = "viz_constellation_lead"
span = 3
height = "lg"
tone = "night"

[[extra.viz]]
kind = "pulse"
source = "recent.commits"
title = "viz_pulse_title"
lead = "viz_pulse_lead"
span = 3
height = "md"
tone = "night"

[[extra.viz]]
kind = "spiral"
source = "github.contributions"
title = "viz_spiral_title"
lead = "viz_spiral_lead"
span = 1
height = "lg"

[[extra.viz]]
kind = "pack"
source = "index.repos"
title = "viz_pack_title"
lead = "viz_pack_lead"
span = 2
height = "lg"

[[extra.viz]]
kind = "stream"
source = "index.years"
title = "viz_stream_title"
lead = "viz_stream_lead"
span = 3
height = "md"
+++
This site is a working portfolio and, at the same time, a small lesson in how one can be built honestly. Every number on it comes from a script that measured it: the [repositories](@/glossary/repository.md) on GitHub and GitLab, read through their command-line clients, the contribution calendar, and the date of each project's last [commit](@/glossary/commit.md). Nothing is typed twice: the pages of categories, projects and terms are derived from data, and a check refuses a stale copy.

The pictures are [data visualisation](@/glossary/data-visualisation.md) drawn with [D3.js](@/glossary/d3.md) from the same measurements. The **galaxy** places every original repository as a star, one arm per category; the **pulse** is the only picture that is not a snapshot: it asks the public GitHub events API from your browser and redraws the last weeks of [commits](@/glossary/commit.md), pull requests and releases as a heartbeat, every five minutes. The **spiral** lays a year of contributions around a circle, one ring per weekday, so busy seasons glow; the **bubbles** size each language by the repositories written in it; the **streams** show how those languages rose and faded over the years. Hover any of them to read a value, click to open the work behind it.

Who wrote what matters. A [fork](@/glossary/fork.md) or a [mirror](@/glossary/mirror.md) is counted but never shown as the owner's work: a repository is original only when the owner wrote at least half of its commits.

The site itself is built from [front matter](@/glossary/front-matter.md) and data by [Zola](@/glossary/zola.md), a [static site generator](@/glossary/static-site-generator.md), styled with [Flowbite Pro](@/glossary/flowbite-pro.md), and checked against [WCAG](@/glossary/wcag.md) 2.2 AA in both themes before it ships. Machines read the same facts as [JSON-LD](@/glossary/json-ld.md), as `llms.txt` and as `site.json`; social networks draw each page's preview from its [Open Graph](@/glossary/open-graph.md) tags. Every page ends with the concepts it builds on; the [glossary](@/glossary/_index.md) defines each one and cites a source.

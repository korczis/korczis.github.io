+++
title = "Tomas Korcak"
description = "Software that proves its work: tools that make AI agents prove what they did, honest scientific instruments in the browser, and knowledge bases you can check."
template = "index.html"

[extra]
article_title = "How to read this site"
terms = ["repository", "commit", "fork", "mirror", "data-visualisation", "d3", "front-matter", "zola", "static-site-generator", "flowbite-pro", "wcag", "json-ld", "open-graph"]
seo_title = "Tomas Korcak (korczis) · Software that proves its work"
og_title = "Software that proves its work."
og_description = "Tools that make AI agents prove what they did, honest instruments in the browser, and knowledge you can check."
og_image = "og/home.png"
schema = "home"
keywords = ["Tomas Korcak", "korczis", "Majordomus", "AI agents", "software engineering", "scientific visualisation", "Brno"]
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
source = "index.languages"
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

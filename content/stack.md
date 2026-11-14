+++
title = "Stack"
description = "The tools and practices behind every project, and how this site itself is built, checked and deployed."
template = "stack.html"
path = "stack"

[extra]
article_title = "Why one stack"
terms = ["flowbite-pro", "tailwind-css", "alpine-js", "apache-echarts", "chart-js", "cytoscape-js", "d3", "p5-js", "zola", "majordomus", "github-pages", "i18n"]
og_title = "One stack, used the same way everywhere."
og_image = "og/stack.png"
schema = "about"
keywords = ["Flowbite Pro", "Alpine.js", "Apache ECharts", "p5.js", "Zola", "Majordomus"]
[[extra.viz]]
kind = "skillset"
source = "index.skillset"
title = "viz_skillset_title"
lead = "viz_skillset_lead"
span = 3
height = "lg"
+++
A stack is a set of decisions made once so they need not be made again. Using the same few tools in every project means each new one starts from a known shape: the same shell, the same components, the same checks.

The interface is [Flowbite Pro](@/glossary/flowbite-pro.md) on [Tailwind CSS](@/glossary/tailwind-css.md); behaviour is added with [Alpine.js](@/glossary/alpine-js.md) to pages that already work without it. Pictures have the library that suits them: [Apache ECharts](@/glossary/apache-echarts.md) for dense charts and networks, [D3.js](@/glossary/d3.md) for drawings where data becomes form, and [p5.js](@/glossary/p5-js.md) for generative art. The sunburst at the top of this page is one of them at work: ECharts splits the most recently active repositories by category and then by language, measured, not claimed. Earlier versions of the site drew simple charts with [Chart.js](@/glossary/chart-js.md) and networks with [Cytoscape.js](@/glossary/cytoscape-js.md); ECharts replaced both, so every chart goes through one layer.

The site is assembled by [Zola](@/glossary/zola.md) in two languages ([internationalisation](@/glossary/i18n.md) is checked like any other rule), deployed to [GitHub Pages](@/glossary/github-pages.md), and supervised by [Majordomus](@/glossary/majordomus.md), which refuses to call work done before its verification ran.

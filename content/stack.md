+++
title = "Stack"
description = "The tools and practices behind every project, and how this site itself is built, checked and deployed."
template = "stack.html"
path = "stack"

[extra]
article_title = "Why one stack"
terms = ["flowbite-pro", "tailwind-css", "alpine-js", "cytoscape-js", "apache-echarts", "chart-js", "d3", "p5-js", "zola", "majordomus", "github-pages", "i18n"]
og_title = "One stack, used the same way everywhere."
og_image = "og/stack.png"
schema = "about"
keywords = ["Flowbite Pro", "Alpine.js", "Cytoscape.js", "Apache ECharts", "Chart.js", "p5.js", "Zola", "Majordomus"]
+++
A stack is a set of decisions made once so they need not be made again. Using the same few tools in every project means each new one starts from a known shape: the same shell, the same components, the same checks.

The interface is [Flowbite Pro](@/glossary/flowbite-pro.md) on [Tailwind CSS](@/glossary/tailwind-css.md); behaviour is added with [Alpine.js](@/glossary/alpine-js.md) to pages that already work without it. Pictures have the library that suits them: [Cytoscape.js](@/glossary/cytoscape-js.md) for networks, [Apache ECharts](@/glossary/apache-echarts.md) for dense charts, [Chart.js](@/glossary/chart-js.md) for simple ones, [D3.js](@/glossary/d3.md) for drawings where data becomes form, and [p5.js](@/glossary/p5-js.md) for generative art.

The site is assembled by [Zola](@/glossary/zola.md) in two languages ([internationalisation](@/glossary/i18n.md) is checked like any other rule), deployed to [GitHub Pages](@/glossary/github-pages.md), and supervised by [Majordomus](@/glossary/majordomus.md), which refuses to call work done before its verification ran.

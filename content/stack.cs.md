+++
title = "Stack"
description = "Nástroje a postupy za každým projektem a jak se tento web staví, kontroluje a nasazuje."
template = "stack.html"
path = "cs/stack"

[extra]
article_title = "Proč jeden stack"
terms = ["flowbite-pro", "tailwind-css", "alpine-js", "cytoscape-js", "apache-echarts", "chart-js", "d3", "p5-js", "zola", "majordomus", "github-pages", "i18n"]
og_title = "Jeden stack, všude stejně."
og_image = "og/cs-stack.png"
schema = "about"
keywords = ["Flowbite Pro", "Alpine.js", "Cytoscape.js", "Apache ECharts", "Chart.js", "p5.js", "Zola", "Majordomus"]
[[extra.viz]]
kind = "skillset"
source = "index.skillset"
title = "viz_skillset_title"
lead = "viz_skillset_lead"
span = 3
height = "lg"
+++
Stack je soubor rozhodnutí udělaných jednou, aby se nemusela dělat znovu. Stejných pár nástrojů v každém projektu znamená, že každý nový začíná ze známého tvaru: stejný shell, stejné komponenty, stejné kontroly.

Rozhraní je [Flowbite Pro](@/glossary/flowbite-pro.cs.md) nad [Tailwind CSS](@/glossary/tailwind-css.cs.md); chování přidává [Alpine.js](@/glossary/alpine-js.cs.md) ke stránkám, které fungují i bez něj. Obrázky mají knihovnu, která jim sedí: [Cytoscape.js](@/glossary/cytoscape-js.cs.md) pro sítě, [Apache ECharts](@/glossary/apache-echarts.cs.md) pro husté grafy, [Chart.js](@/glossary/chart-js.cs.md) pro jednoduché, [D3.js](@/glossary/d3.cs.md) pro kresby, kde se z dat stává tvar, a [p5.js](@/glossary/p5-js.cs.md) pro generativní umění. Sluneční graf nahoře na této stránce je jednou z nich v akci: ECharts dělí naposledy aktivní repozitáře podle kategorie a pak podle jazyka, změřené, ne tvrzené.

Web skládá [Zola](@/glossary/zola.cs.md) ve dvou jazycích ([internacionalizace](@/glossary/i18n.cs.md) se kontroluje jako každé jiné pravidlo), nasazuje se na [GitHub Pages](@/glossary/github-pages.cs.md) a dohlíží na něj [Majordomus](@/glossary/majordomus.cs.md), který odmítne prohlásit práci za hotovou, dokud neproběhlo její ověření.

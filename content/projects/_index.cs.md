+++
title = "Projekty"
description = "Každý projekt v katalogu: co to je, na čem je postavený, jestli běží a jestli nad ním dohlíží Majordomus."
template = "projects.html"

[extra]
article_title = "Jak je katalog uspořádaný"
terms = ["repository", "open-source", "ai-agent", "osint", "gis", "data-visualisation"]
og_title = "Projekty: živé, veřejné, změřené."
og_image = "og/cs-projects.png"
schema = "collection"
keywords = ["projekty Tomáše Korčáka", "Majordomus", "Oscilla", "algoglyph", "Kompendium", "open source", "portfolio"]
[[extra.viz]]
kind = "graph"
source = "catalogue.graph"
title = "viz_graph_title"
lead = "viz_graph_lead"
span = 3
height = "lg"
+++
Katalog má dvě vrstvy. Hrstka projektů je vybraná: zvolil je vlastník a popsal je vlastními slovy. Vše ostatní se třídí automaticky, takže katalog roste s prací a nikdy nepotřebuje údržbu.

Každá kategorie je pravidlo, ne složka. [Repozitář](@/glossary/repository.cs.md) spadne do kategorie, když jeho název, popis nebo témata odpovídají klíčovým slovům pravidla, jinak rozhodne jeho hlavní jazyk. Proto vedle sebe skončí dohled nad [AI agenty](@/glossary/ai-agent.cs.md), případy [OSINT](@/glossary/osint.cs.md), katalogy [GIS](@/glossary/gis.cs.md) i [vizualizace dat](@/glossary/data-visualisation.cs.md), aniž by je kdo třídil.

Každá stránka kategorie se vysvětluje stejně a každý projekt vede ke svému [open-source](@/glossary/open-source.cs.md) kódu.

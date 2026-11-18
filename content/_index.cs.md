+++
title = "Tomáš Korčák"
description = "Tomáš Korčák, staff engineer pro infrastrukturu AI agentů (Elixir, Rust): technická due diligence před transakcí a AI agenti, jejichž práci lze ověřit."
template = "index.html"

[extra]
article_title = "Jak číst tento web"
reading_path = ["work/prismatic-majordomus.md", "stack.md", "interfaces.md", "hire.md", "work/_index.md", "repositories/_index.md"]
terms = ["repository", "commit", "fork", "mirror", "data-visualisation", "d3", "front-matter", "zola", "static-site-generator", "flowbite-pro", "wcag", "json-ld", "open-graph", "ai-agent", "mcp", "orchestration", "audit-trail", "osint", "due-diligence", "elixir", "rust", "apache-echarts"]
seo_title = "Tomáš Korčák · Staff engineer, infrastruktura AI agentů (Elixir, Rust)"
og_title = "Tomáš Korčák: staff engineer pro infrastrukturu AI agentů."
og_description = "Due diligence před investicí nebo akvizicí a infrastruktura AI agentů, jejichž práci lze zpětně dohledat a ověřit."
og_image = "og/cs-home.png"
schema = "home"
keywords = ["Tomáš Korčák", "korczis", "Majordomus", "AI agenti", "vývoj softwaru", "vědecká vizualizace", "Brno"]
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
Tato stránka je portfolio uspořádané jako doklady. Její začátek odpovídá na to, na co se náborový tým ptá nejdřív: kdo je Tomáš Korčák, na jaké role si ho najímají a za jakých podmínek; všechno pod tím odkazuje tam, kde se to dá ověřit. Každé číslo na ní pochází ze skriptu, který ho změřil: [repozitáře](@/glossary/repository.cs.md) na GitHubu a GitLabu čtené jejich řádkovými klienty, kalendář příspěvků a datum posledního [commitu](@/glossary/commit.cs.md) každého projektu. Nic se nepíše dvakrát a kontrola odmítne zastaralou kopii.

[Majordomus](@/work/prismatic-majordomus.cs.md) je vlajková loď. Dohlíží na [AI agenty](@/glossary/ai-agent.cs.md), kteří píší kód: jedna politika pro každého programovacího asistenta, vymezené úkoly se smlouvou o dokončení a [auditní stopa](@/glossary/audit-trail.cs.md) toho, co který agent udělal. Je napsaný v [Rustu](@/glossary/rust.cs.md), svá pravidla nabízí přes [MCP](@/glossary/mcp.cs.md) a [orchestraci](@/glossary/orchestration.cs.md) dělá lokálně, bez volání modelu. Tento web běží pod ním, takže pravidla a brány, které případová studie počítá, jsou ty, které zkontrolovaly tuto stránku.

Klientská práce je [due diligence](@/glossary/due-diligence.cs.md), M&A a AI, anonymizovaná podle NDA: zakázky se vytěžují ze soukromých repozitářů a na stránku se dostanou jen dovednosti, odvětví a rozsah, které ukazují, spočtené a nikdy nejmenované. Velká část je [OSINT](@/glossary/osint.cs.md) a datová práce v [Elixiru](@/glossary/elixir.cs.md).

Živé nástroje běží v prohlížeči bez instalace: [Oscilla](@/work/oscilla.cs.md), akustická laboratoř, a [algoglyph](@/work/algoglyph.cs.md), algoritmy a fyzika kreslené jako glyfy. Každý se před nasazením ověří naživo a odkazuje na svůj zdroj.

Záleží na tom, kdo co napsal. [Fork](@/glossary/fork.cs.md) nebo [mirror](@/glossary/mirror.cs.md) se započítá, ale nikdy se nevydává za práci Tomáše Korčáka: repozitář je původní, jen když napsal aspoň polovinu jeho commitů. Čtou se obě platformy a repozitáře se slučují podle jména, takže repozitář na obou se počítá jednou; graf toho, jak se repozitáře počítají, ukazuje každý krok.

Dovednosti se měří, netvrdí. Jazyk počítá původní repozitáře v něm napsané, technologie projekty, jejichž stack ji uvádí, dovednost klientské zakázky, které ji ukazují, a každý řádek odkazuje na své doklady. Rozpětí vede od prvního veřejného repozitáře k poslednímu pushi: měří veřejnou práci, ne senioritu.

Samotnou stránku staví z [front matter](@/glossary/front-matter.cs.md) a dat [Zola](@/glossary/zola.cs.md), [generátor statických webů](@/glossary/static-site-generator.cs.md); styly dává [Flowbite Pro](@/glossary/flowbite-pro.cs.md) a před nasazením se kontroluje proti [WCAG](@/glossary/wcag.cs.md) AA v obou motivech. Obrázky jsou [vizualizace dat](@/glossary/data-visualisation.cs.md) nakreslené knihovnami [D3.js](@/glossary/d3.cs.md) a [Apache ECharts](@/glossary/apache-echarts.cs.md) ze stejných měření: najetím na značku se ukáže hodnota, kliknutím se otevře práce za ní. Stroje čtou stejná fakta jako [JSON-LD](@/glossary/json-ld.cs.md), `llms.txt`, `site.json` a `resume.json`; sociální sítě z [Open Graph](@/glossary/open-graph.cs.md) tagů kreslí náhled každé stránky. Role a podmínky i s doklady ke každé jsou na [stránce o spolupráci](@/hire.cs.md). Každá stránka končí pojmy, na kterých stojí; [slovník](@/glossary/_index.cs.md) každý z nich definuje a uvádí zdroj.

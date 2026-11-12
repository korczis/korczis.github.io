+++
title = "Tomáš Korčák"
description = "Software, který svou práci dokládá: nástroje, které nutí AI agenty doložit výsledky, poctivé vědecké přístroje v prohlížeči a ověřitelné znalostní báze."
template = "index.html"

[extra]
article_title = "Jak číst tento web"
terms = ["repository", "commit", "fork", "mirror", "data-visualisation", "d3", "front-matter", "zola", "static-site-generator", "flowbite-pro", "wcag", "json-ld", "open-graph"]
seo_title = "Tomáš Korčák (korczis) · Software, který svou práci dokládá"
og_title = "Software, který svou práci dokládá."
og_description = "Nástroje, které nutí AI agenty doložit práci, poctivé přístroje v prohlížeči a znalosti, které si ověříte."
og_image = "og/cs-home.png"
schema = "home"
keywords = ["Tomáš Korčák", "korczis", "Majordomus", "AI agenti", "vývoj softwaru", "vědecká vizualizace", "Brno"]
[[extra.viz]]
kind = "constellation"
source = "index.repos"
title = "viz_constellation_title"
lead = "viz_constellation_lead"
span = 3
height = "lg"
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
Tento web je pracovní portfolio a zároveň malá lekce, jak se dá takové portfolio postavit poctivě. Každé číslo na něm pochází ze skriptu, který ho změřil: [repozitáře](@/glossary/repository.cs.md) na GitHubu a GitLabu čtené jejich řádkovými klienty, kalendář příspěvků a datum posledního [commitu](@/glossary/commit.cs.md) každého projektu. Nic se nepíše dvakrát: stránky kategorií, projektů a pojmů se odvozují z dat a kontrola odmítne zastaralou kopii.

Obrázky jsou [vizualizace dat](@/glossary/data-visualisation.cs.md) nakreslené knihovnou [D3.js](@/glossary/d3.cs.md) ze stejných měření. **Spirála** rozkládá rok příspěvků do kruhu, jeden prstenec na den v týdnu, takže rušná období září; **bubliny** mají velikost podle počtu repozitářů v daném jazyce; **proudy** ukazují, jak jazyky v průběhu let sílily a slábly. Najetím myší se ukáže hodnota, kliknutím se otevře práce za ní.

Záleží na tom, kdo co napsal. [Fork](@/glossary/fork.cs.md) nebo [mirror](@/glossary/mirror.cs.md) se započítá, ale nikdy se nevydává za vlastníkovu práci: repozitář je původní, jen když vlastník napsal aspoň polovinu jeho commitů.

Samotný web staví z [front matter](@/glossary/front-matter.cs.md) a dat [Zola](@/glossary/zola.cs.md), [generátor statických webů](@/glossary/static-site-generator.cs.md); styly dává [Flowbite Pro](@/glossary/flowbite-pro.cs.md) a před nasazením se kontroluje proti [WCAG](@/glossary/wcag.cs.md) 2.2 AA v obou tématech. Stroje čtou stejná fakta jako [JSON-LD](@/glossary/json-ld.cs.md), `llms.txt` a `site.json`; sociální sítě z [Open Graph](@/glossary/open-graph.cs.md) tagů kreslí náhled každé stránky. Každá stránka končí pojmy, na kterých stojí; [slovník](@/glossary/_index.cs.md) každý z nich definuje a uvádí zdroj.

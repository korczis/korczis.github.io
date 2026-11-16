+++
title = "Rozhraní"
description = "Web pro stroje: jeho vrstva Majordomu s URI zdrojů MCP, jak připojit agenta přes MCP a každý publikovaný soubor popsaný v OpenAPI."
template = "interfaces.html"
path = "cs/interfaces"

[extra]
article_title = "Proč má osobní web rozhraní"
terms = ["majordomus", "mcp", "openapi", "ai-agent", "json-ld", "github-pages"]
og_title = "Stejná fakta pro lidi i pro stroje."
og_image = "og/cs-interfaces.png"
schema = "about"
keywords = ["MCP", "OpenAPI", "Swagger", "Majordomus", ".ai", "llms.txt"]
+++
Stránka psaná pro lidi je jeden způsob, jak tento web číst; tatáž fakta jsou publikovaná i pro programy. Nic na této stránce není napsané ručně: každá část je odvozená ze souboru, který repozitář už má, a gate zastaví build, když se ty dva rozejdou.

Pravidla, jimiž se řídí [AI agenti](@/glossary/ai-agent.cs.md) pracující na tomto repozitáři, leží v jeho adresáři `.ai/` pod dohledem [Majordomu](@/glossary/majordomus.cs.md). Tabulka nahoře je vlastní index Majordomu nad tímto adresářem, takže každý objekt nese adresu, pod kterou si ho agent vyžádá: své URI zdroje [MCP](@/glossary/mcp.cs.md). Kterýkoli klient MCP může tytéž objekty číst živě z klonu repozitáře, spolu s nástroji, které Majordomus nabízí.

Samotný web je sada souborů na [GitHub Pages](@/glossary/github-pages.cs.md): katalog jako `site.json`, prostý text pro jazykové modely jako `llms.txt`, JSON Schemata, podle kterých se kontrolují jeho data. Jsou popsané v [OpenAPI](@/glossary/openapi.cs.md), takže je Swagger UI nebo jakýkoli generátor klientů přečte bez hádání, vedle [JSON-LD](@/glossary/json-ld.cs.md), které nese každá stránka.

+++
title = "Interfaces"
description = "The site for machines: its Majordomus layer with MCP resource URIs, how to connect an agent over MCP, and every published file described in OpenAPI."
template = "interfaces.html"
path = "interfaces"

[extra]
article_title = "Why a personal site has interfaces"
terms = ["majordomus", "mcp", "openapi", "ai-agent", "json-ld", "github-pages"]
og_title = "The same facts, for people and for machines."
og_image = "og/interfaces.png"
schema = "about"
keywords = ["MCP", "OpenAPI", "Swagger", "Majordomus", ".ai", "llms.txt"]
+++
A page written for people is one way to read this site; the same facts are also published for programs. Nothing on this page is typed: each part is derived from a file the repository already holds, and a gate fails the build when the two drift apart.

The rules the [AI agents](@/glossary/ai-agent.md) working on this repository obey live in its `.ai/` directory, supervised by [Majordomus](@/glossary/majordomus.md). The table at the top is Majordomus's own index of that directory, so each object carries the address an agent asks for it by: its [MCP](@/glossary/mcp.md) resource URI. Any MCP client can read the same objects live from a checkout of the repository, together with the tools Majordomus provides.

The site itself is a set of files on [GitHub Pages](@/glossary/github-pages.md): the catalogue as `site.json`, the plain text for language models as `llms.txt`, the JSON Schemas its data is checked against. They are described in [OpenAPI](@/glossary/openapi.md), so Swagger UI or any client generator can read them without guessing, alongside the [JSON-LD](@/glossary/json-ld.md) every page carries.

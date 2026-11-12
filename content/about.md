+++
title = "About"
description = "Tomas Korcak (korczis), software engineer in Brno: what I build, the languages I build it in over the years, and where to find it."
template = "about.html"
path = "about"

[extra]
article_title = "A working method"
terms = ["majordomus", "ai-agent", "osint", "open-source", "rust", "elixir", "ruby", "javascript"]
seo_title = "Tomas Korcak (korczis) · About and CV"
og_title = "Tomas Korcak, software engineer."
og_description = "Fifteen years of public work on GitHub and GitLab: AI supervision, scientific instruments, data and tools."
og_image = "og/about.png"
schema = "profile"
keywords = ["Tomas Korcak", "korczis", "CV", "software engineer", "Brno", "Majordomus", "Elixir", "Rust", "open source"]
[[extra.viz]]
kind = "stream"
source = "index.years"
title = "viz_stream_title"
lead = "viz_stream_lead"
span = 2
height = "lg"

[[extra.viz]]
kind = "pack"
source = "index.languages"
title = "viz_pack_title"
lead = "viz_pack_lead"
span = 1
height = "lg"
+++
The repositories tell the story better than a biography could. The language streams on this page start in [Ruby](@/glossary/ruby.md) and [JavaScript](@/glossary/javascript.md), the tools of the early web, widen into [Elixir](@/glossary/elixir.md) for systems that must keep running, and arrive at [Rust](@/glossary/rust.md) where correctness and speed both matter. The constant is the method, not the language.

That method is evidence over claims. In [OSINT](@/glossary/osint.md) work an answer without a source is worthless; the same rule runs through the software here. A number on a page is measured, a page that follows from data is generated, and a claim that something works is backed by the check that proved it.

The newest work applies that rule to [AI agents](@/glossary/ai-agent.md). [Majordomus](@/glossary/majordomus.md) gives every coding agent the same policy, scopes each task, and lets work land only when its verification ran; this site is built under it. Most of the code is [open source](@/glossary/open-source.md), so every statement here can be followed to the repository that shows it.

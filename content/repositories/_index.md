+++
title = "Repositories"
description = "Every original public repository on GitHub and GitLab, merged by name, with its inferred category, language and both links."
template = "repositories.html"

[extra]
article_title = "What counts as original"
terms = ["repository", "commit", "fork", "mirror", "open-source"]
og_title = "Every public repository, original work only."
og_image = "og/repositories.png"
schema = "index"
keywords = ["Tomas Korcak repositories", "korczis GitHub", "korczis GitLab", "open source", "Elixir", "Rust", "Ruby", "JavaScript"]

[[extra.viz]]
kind = "languages"
source = "index.languages"
title = "viz_languages_title"
lead = "viz_languages_lead"
span = 3
height = "lg"
+++
An index of repositories is only useful if it is honest about authorship. This one merges GitHub and GitLab by name and then asks one question of every [repository](@/glossary/repository.md): who wrote its [commits](@/glossary/commit.md)?

A repository counts as original when the owner wrote at least half of them. A [fork](@/glossary/fork.md) is someone else's project copied for study or a patch; a [mirror](@/glossary/mirror.md) carries another project's code. Both are counted in the totals, so nothing is hidden, but neither is listed as the owner's work. A short list of repositories the owner chose to hide is counted the same way.

Use the filters to narrow the list by language or category; every row opens the [open-source](@/glossary/open-source.md) code it describes.

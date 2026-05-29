# animus-subject-openalex-works

OpenAlex scholarly works subject backend plugin for Animus.

## Install

```sh
animus plugin install launchapp-dev/animus-subject-openalex-works --signature-policy strict
```

## Configuration

No configuration is required for the default OpenAlex works feed.

Optional:

```sh
export OPENALEX_SEARCH="machine learning"
export OPENALEX_FILTER="publication_year:2026,type:article"
export OPENALEX_SORT="cited_by_count:desc"
export OPENALEX_API_URL=https://api.openalex.org
export OPENALEX_MAILTO=opensource@launchapp.dev
export OPENALEX_QUERY="transformer"
export OPENALEX_LIMIT=50
```

`OPENALEX_SEARCH`, `OPENALEX_FILTER`, and `OPENALEX_SORT` are passed to the
OpenAlex `/works` endpoint. `OPENALEX_QUERY` is a local text filter applied
after works are fetched.

## Subject Kind

`openalex.work`

Subjects map OpenAlex works into Animus with publication metadata, DOI, primary
source, authorship, open access state, citation count, concepts, topics, grants,
and raw work metadata.

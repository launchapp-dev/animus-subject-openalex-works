import { definePlugin, PluginKind, type Subject, type SubjectBackend, type SubjectListParams, type SubjectStatus } from "@launchapp-dev/animus-plugin-sdk";

const NAME = "animus-subject-openalex-works";
const VERSION = "0.1.0";
const SUBJECT_KIND = "openalex.work";
const DEFAULT_API_URL = "https://api.openalex.org";

interface Config {
  apiUrl: string;
  search?: string;
  filter?: string;
  sort?: string;
  mailto?: string;
  query?: string;
  limit: number;
}

interface OpenAlexAuthor {
  id?: string;
  display_name?: string;
  orcid?: string | null;
}

interface OpenAlexAuthorship {
  author_position?: string;
  author?: OpenAlexAuthor;
  institutions?: Array<{ id?: string; display_name?: string; ror?: string | null; country_code?: string | null }>;
  countries?: string[];
  is_corresponding?: boolean;
}

interface OpenAlexLocation {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  source?: { id?: string; display_name?: string; issn_l?: string | null; type?: string | null };
}

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  display_name?: string;
  title?: string;
  publication_year?: number;
  publication_date?: string;
  type?: string;
  type_crossref?: string | null;
  language?: string | null;
  cited_by_count?: number;
  is_retracted?: boolean;
  is_paratext?: boolean;
  open_access?: { is_oa?: boolean; oa_status?: string; oa_url?: string | null };
  primary_location?: OpenAlexLocation | null;
  locations_count?: number;
  referenced_works_count?: number;
  authorships?: OpenAlexAuthorship[];
  concepts?: Array<{ id?: string; display_name?: string; score?: number }>;
  topics?: Array<{ id?: string; display_name?: string; score?: number }>;
  grants?: Array<{ funder?: string; funder_display_name?: string; award_id?: string }>;
}

interface OpenAlexListResponse {
  meta?: { count?: number; per_page?: number; page?: number };
  results?: OpenAlexWork[];
}

function optionalEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw === "" ? undefined : raw;
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  return (raw ?? fallback).replace(/\/+$/, "");
}

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function readConfig(): Config {
  return {
    apiUrl: normalizeBaseUrl(optionalEnv("OPENALEX_API_URL"), DEFAULT_API_URL),
    search: optionalEnv("OPENALEX_SEARCH"),
    filter: optionalEnv("OPENALEX_FILTER"),
    sort: optionalEnv("OPENALEX_SORT"),
    mailto: optionalEnv("OPENALEX_MAILTO"),
    query: optionalEnv("OPENALEX_QUERY"),
    limit: readPositiveInt(optionalEnv("OPENALEX_LIMIT"), 50, 200),
  };
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

function decodePart(value: string): string {
  return decodeURIComponent(value);
}

function workId(work: OpenAlexWork): string {
  return work.id ?? "unknown";
}

function shortWorkId(id: string): string {
  return id.replace(/^https?:\/\/openalex\.org\//, "");
}

function workSubjectId(id: string): string {
  return `${SUBJECT_KIND}:${encodePart(id)}`;
}

function parseWorkSubjectId(id: string): string {
  const raw = id.startsWith(`${SUBJECT_KIND}:`) ? id.slice(`${SUBJECT_KIND}:`.length) : id;
  if (!raw) throw new Error(`expected id '${SUBJECT_KIND}:<openalex-work-id>', got '${id}'`);
  return decodePart(raw);
}

function toIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined;
}

function firstAuthor(work: OpenAlexWork): string | undefined {
  return work.authorships?.find((authorship) => authorship.author?.display_name)?.author?.display_name;
}

function primarySource(work: OpenAlexWork): string | undefined {
  return work.primary_location?.source?.display_name;
}

function nativeStatus(work: OpenAlexWork): string {
  if (work.is_retracted) return "retracted";
  return work.type ?? "work";
}

function statusFromWork(work: OpenAlexWork): SubjectStatus {
  return work.is_retracted ? "cancelled" : "done";
}

function priorityFromWork(work: OpenAlexWork): number {
  if (work.is_retracted) return 1;
  const cited = work.cited_by_count ?? 0;
  if (cited >= 5000) return 0;
  if (cited >= 500) return 1;
  if (cited >= 50) return 2;
  return 3;
}

function labelsFromWork(config: Config, work: OpenAlexWork): string[] {
  const labels = new Set<string>(["openalex", nativeStatus(work)]);
  if (config.search) labels.add(`search:${config.search}`);
  if (work.publication_year) labels.add(`year:${work.publication_year}`);
  if (work.language) labels.add(`lang:${work.language}`);
  if (work.open_access?.oa_status) labels.add(`oa:${work.open_access.oa_status}`);
  const source = primarySource(work);
  if (source) labels.add(`source:${source}`);
  const author = firstAuthor(work);
  if (author) labels.add(`author:${author}`);
  return [...labels];
}

function subjectFromWork(config: Config, work: OpenAlexWork, fetchedAt = new Date().toISOString()): Subject {
  const id = workId(work);
  const createdAt = toIso(work.publication_date) ?? (work.publication_year ? `${work.publication_year}-01-01T00:00:00.000Z` : fetchedAt);
  return {
    id: workSubjectId(id),
    kind: SUBJECT_KIND,
    title: work.display_name ?? work.title ?? `OpenAlex work ${shortWorkId(id)}`,
    description: `${nativeStatus(work)} from OpenAlex${primarySource(work) ? ` in ${primarySource(work)}` : ""}`,
    status: statusFromWork(work),
    created_at: createdAt,
    updated_at: createdAt,
    labels: labelsFromWork(config, work),
    assignee: firstAuthor(work),
    url: work.primary_location?.landing_page_url ?? work.open_access?.oa_url ?? work.doi ?? id,
    native_status: nativeStatus(work),
    priority: priorityFromWork(work),
    custom: {
      openalex_id: id,
      short_id: shortWorkId(id),
      doi: work.doi,
      publication_year: work.publication_year,
      publication_date: work.publication_date,
      type: work.type,
      type_crossref: work.type_crossref,
      language: work.language,
      cited_by_count: work.cited_by_count,
      is_retracted: work.is_retracted,
      is_paratext: work.is_paratext,
      open_access: work.open_access,
      primary_location: work.primary_location,
      locations_count: work.locations_count,
      referenced_works_count: work.referenced_works_count,
      authorships: work.authorships,
      concepts: work.concepts,
      topics: work.topics,
      grants: work.grants,
      raw: work,
    },
  };
}

function matchesConfiguredFilters(config: Config, work: OpenAlexWork): boolean {
  if (!config.query) return true;
  const needle = config.query.toLowerCase();
  const haystack = [
    config.search,
    work.id,
    work.doi,
    work.display_name,
    work.title,
    work.type,
    work.type_crossref,
    work.language,
    primarySource(work),
    firstAuthor(work),
    ...(work.concepts ?? []).map((concept) => concept.display_name),
    ...(work.topics ?? []).map((topic) => topic.display_name),
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function matchesFilters(config: Config, work: OpenAlexWork, params: SubjectListParams): boolean {
  if (!matchesConfiguredFilters(config, work)) return false;
  const subject = subjectFromWork(config, work);
  if (params.status && params.status.length > 0 && !params.status.includes(subject.status)) return false;
  if (params.assignee && params.assignee.length > 0 && (!subject.assignee || !params.assignee.includes(subject.assignee))) return false;
  const labels = new Set(subject.labels ?? []);
  if (params.labels_all && !params.labels_all.every((label) => labels.has(label))) return false;
  if (params.labels_any && params.labels_any.length > 0 && !params.labels_any.some((label) => labels.has(label))) return false;
  if (params.updated_since && new Date(subject.updated_at) < new Date(params.updated_since)) return false;
  return true;
}

class OpenAlexWorksClient {
  constructor(private readonly config: Config) {}

  async requestJson<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.config.apiUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    if (this.config.mailto) url.searchParams.set("mailto", this.config.mailto);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `${NAME}/${VERSION} (https://github.com/launchapp-dev/${NAME})`,
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`OpenAlex API ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    return JSON.parse(text) as T;
  }

  async list(): Promise<OpenAlexWork[]> {
    const payload = await this.requestJson<OpenAlexListResponse>("/works", {
      search: this.config.search,
      filter: this.config.filter,
      sort: this.config.sort,
      "per-page": this.config.limit,
    });
    return payload.results ?? [];
  }

  async get(id: string): Promise<OpenAlexWork> {
    return this.requestJson<OpenAlexWork>(`/works/${encodeURIComponent(shortWorkId(id))}`);
  }
}

function buildBackend(): SubjectBackend {
  let cached: { client: OpenAlexWorksClient; config: Config } | null = null;
  const runtime = (): { client: OpenAlexWorksClient; config: Config } => {
    if (!cached) {
      const config = readConfig();
      cached = { client: new OpenAlexWorksClient(config), config };
    }
    return cached;
  };
  return {
    async list(params) {
      const { client, config } = runtime();
      const works = await client.list();
      return {
        subjects: works.filter((work) => matchesFilters(config, work, params)).map((work) => subjectFromWork(config, work)),
        next_cursor: null,
        fetched_at: new Date().toISOString(),
      };
    },
    async get(params) {
      const { client, config } = runtime();
      return subjectFromWork(config, await client.get(parseWorkSubjectId(params.id)));
    },
    schema() {
      return {
        kinds: [SUBJECT_KIND],
        status_values: ["ready", "in-progress", "blocked", "done", "cancelled"],
        supports_watch: false,
        supports_create: false,
        supports_pagination: false,
        native_status_values: ["article", "book-chapter", "book", "dataset", "dissertation", "paratext", "preprint", "report", "review", "retracted", "work"],
        status_dispatch_hints: [
          { native_status: "retracted", status: "cancelled" },
          { native_status: "article", status: "done" },
          { native_status: "book-chapter", status: "done" },
          { native_status: "work", status: "done" },
        ],
        custom_fields: ["openalex_id", "short_id", "doi", "publication_year", "publication_date", "type", "type_crossref", "language", "cited_by_count", "is_retracted", "is_paratext", "open_access", "primary_location", "locations_count", "referenced_works_count", "authorships", "concepts", "topics", "grants", "raw"],
      };
    },
    async health() {
      try {
        const { client } = runtime();
        await client.list();
        return { status: "healthy", uptime_ms: null, memory_usage_bytes: null, last_error: null };
      } catch (err) {
        return { status: "unhealthy", uptime_ms: null, memory_usage_bytes: null, last_error: String(err) };
      }
    },
  };
}

export {
  OpenAlexWorksClient,
  firstAuthor,
  labelsFromWork,
  matchesConfiguredFilters,
  matchesFilters,
  nativeStatus,
  parseWorkSubjectId,
  primarySource,
  priorityFromWork,
  shortWorkId,
  statusFromWork,
  subjectFromWork,
  toIso,
  workId,
  workSubjectId,
};

const plugin = definePlugin({
  kind: PluginKind.SubjectBackend,
  name: NAME,
  version: VERSION,
  description: "OpenAlex scholarly works subject backend plugin for Animus",
  subject_kinds: [SUBJECT_KIND],
  env_required: [
    { name: "OPENALEX_SEARCH", description: "Optional full-text search term for works.", required: false },
    { name: "OPENALEX_FILTER", description: "Optional OpenAlex filter expression.", required: false },
    { name: "OPENALEX_SORT", description: "Optional OpenAlex sort expression.", required: false },
    { name: "OPENALEX_API_URL", description: `Optional OpenAlex API base URL. Defaults to ${DEFAULT_API_URL}.`, required: false },
    { name: "OPENALEX_MAILTO", description: "Optional email address for OpenAlex polite pool.", required: false },
    { name: "OPENALEX_QUERY", description: "Optional local text query applied to works.", required: false },
    { name: "OPENALEX_LIMIT", description: "Optional maximum work count from 1 to 200. Defaults to 50.", required: false },
  ],
  impl: buildBackend(),
});

function isDirectRun(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("index.cjs") || entry.endsWith("index.js") || entry.endsWith(NAME);
}

if (isDirectRun()) {
  plugin.run().catch((err) => {
    process.stderr.write(`[${NAME}] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}

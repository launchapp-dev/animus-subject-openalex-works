import { describe, expect, it } from "vitest";
import {
  firstAuthor,
  labelsFromWork,
  matchesConfiguredFilters,
  matchesFilters,
  nativeStatus,
  parseWorkSubjectId,
  priorityFromWork,
  shortWorkId,
  statusFromWork,
  subjectFromWork,
  toIso,
  workId,
  workSubjectId,
} from "./index";

const config = {
  apiUrl: "https://api.openalex.org",
  search: "machine learning",
  limit: 50,
};

const work = {
  id: "https://openalex.org/W2101234009",
  doi: "https://doi.org/10.48550/arxiv.1201.0490",
  display_name: "Scikit-learn: Machine Learning in Python",
  publication_year: 2012,
  publication_date: "2012-01-02",
  type: "article",
  type_crossref: "journal-article",
  language: "en",
  cited_by_count: 63662,
  is_retracted: false,
  is_paratext: false,
  open_access: { is_oa: true, oa_status: "green", oa_url: "https://arxiv.org/abs/1201.0490" },
  primary_location: {
    landing_page_url: "https://jmlr.org/papers/v12/pedregosa11a.html",
    source: { display_name: "Journal of Machine Learning Research", type: "journal" },
  },
  locations_count: 4,
  referenced_works_count: 18,
  authorships: [
    {
      author_position: "first",
      author: { id: "https://openalex.org/A5000000000", display_name: "Fabian Pedregosa" },
    },
  ],
  concepts: [{ display_name: "Machine learning", score: 0.95 }],
  topics: [{ display_name: "Data science", score: 0.82 }],
  grants: [{ funder_display_name: "INRIA", award_id: "sklearn" }],
};

describe("OpenAlex work helpers", () => {
  it("builds ids", () => {
    expect(workId(work)).toBe("https://openalex.org/W2101234009");
    expect(shortWorkId(work.id)).toBe("W2101234009");
    expect(workSubjectId(work.id)).toBe("openalex.work:https%3A%2F%2Fopenalex.org%2FW2101234009");
    expect(parseWorkSubjectId("openalex.work:https%3A%2F%2Fopenalex.org%2FW2101234009")).toBe(work.id);
  });

  it("maps works to subjects", () => {
    const subject = subjectFromWork(config, work);
    expect(subject.id).toBe("openalex.work:https%3A%2F%2Fopenalex.org%2FW2101234009");
    expect(subject.kind).toBe("openalex.work");
    expect(subject.title).toBe("Scikit-learn: Machine Learning in Python");
    expect(subject.status).toBe("done");
    expect(subject.native_status).toBe("article");
    expect(subject.assignee).toBe("Fabian Pedregosa");
    expect(subject.url).toBe("https://jmlr.org/papers/v12/pedregosa11a.html");
    expect(subject.priority).toBe(0);
    expect(subject.custom?.short_id).toBe("W2101234009");
    expect(subject.custom?.doi).toBe("https://doi.org/10.48550/arxiv.1201.0490");
  });

  it("maps native status and priority", () => {
    expect(firstAuthor(work)).toBe("Fabian Pedregosa");
    expect(nativeStatus(work)).toBe("article");
    expect(statusFromWork(work)).toBe("done");
    expect(priorityFromWork(work)).toBe(0);
    expect(priorityFromWork({ ...work, cited_by_count: 600 })).toBe(1);
    expect(priorityFromWork({ ...work, cited_by_count: 60 })).toBe(2);
    expect(priorityFromWork({ ...work, cited_by_count: 5 })).toBe(3);
    expect(statusFromWork({ ...work, is_retracted: true })).toBe("cancelled");
  });

  it("builds labels", () => {
    expect(labelsFromWork(config, work)).toEqual([
      "openalex",
      "article",
      "search:machine learning",
      "year:2012",
      "lang:en",
      "oa:green",
      "source:Journal of Machine Learning Research",
      "author:Fabian Pedregosa",
    ]);
  });

  it("filters by query and list params", () => {
    expect(matchesConfiguredFilters(config, work)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, query: "data science" }, work)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, query: "does-not-match" }, work)).toBe(false);
    expect(matchesFilters(config, work, { status: ["done"] })).toBe(true);
    expect(matchesFilters(config, work, { labels_all: ["openalex", "year:2012"] })).toBe(true);
    expect(matchesFilters(config, work, { labels_any: ["oa:green"] })).toBe(true);
  });

  it("normalizes timestamps", () => {
    expect(toIso("2012-01-02")).toBe("2012-01-02T00:00:00.000Z");
    expect(toIso(undefined)).toBeUndefined();
  });
});

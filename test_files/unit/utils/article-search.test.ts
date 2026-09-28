import { describe, it, expect } from "vitest";
import { matchesArticleSearchQuery } from "../../../src/utils/article-search";
import type { FeedItem } from "../../../src/types/types";

function article(fields: Partial<FeedItem>): FeedItem {
  return {
    title: "",
    link: "",
    description: "",
    pubDate: "",
    guid: "g",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "",
    feedUrl: "",
    coverImage: "",
    ...fields,
  } as FeedItem;
}

describe("matchesArticleSearchQuery", () => {
  const a = article({
    title: "Election results in Missouri",
    feedTitle: "Politico",
    author: "Jane Doe",
    content: "<p>Redistricting fight continues</p>",
    summary: "Court ruling expected",
    description: "State legislature",
  });

  it("matches everything for an empty or whitespace query", () => {
    expect(matchesArticleSearchQuery(a, "")).toBe(true);
    expect(matchesArticleSearchQuery(a, "   ")).toBe(true);
  });

  it("is case-insensitive and searches title, feed, author and body fields", () => {
    expect(matchesArticleSearchQuery(a, "MISSOURI")).toBe(true);
    expect(matchesArticleSearchQuery(a, "politico")).toBe(true);
    expect(matchesArticleSearchQuery(a, "jane")).toBe(true);
    expect(matchesArticleSearchQuery(a, "redistricting")).toBe(true);
    expect(matchesArticleSearchQuery(a, "ruling")).toBe(true);
    expect(matchesArticleSearchQuery(a, "legislature")).toBe(true);
    expect(matchesArticleSearchQuery(a, "iowa")).toBe(false);
  });

  it("ANDs space-separated terms", () => {
    expect(matchesArticleSearchQuery(a, "missouri court")).toBe(true);
    expect(matchesArticleSearchQuery(a, "missouri iowa")).toBe(false);
  });

  it("matches quoted phrases as a whole", () => {
    expect(matchesArticleSearchQuery(a, '"election results"')).toBe(true);
    expect(matchesArticleSearchQuery(a, '"results election"')).toBe(false);
  });

  it("excludes articles containing a -term", () => {
    expect(matchesArticleSearchQuery(a, "missouri -court")).toBe(false);
    expect(matchesArticleSearchQuery(a, "missouri -iowa")).toBe(true);
    // A lone "-" is a literal term, not an empty exclusion.
    expect(matchesArticleSearchQuery(a, "-")).toBe(false);
  });

  it("restricts feed:, author: and title: terms to that field", () => {
    expect(matchesArticleSearchQuery(a, "feed:politico")).toBe(true);
    expect(matchesArticleSearchQuery(a, "feed:missouri")).toBe(false);
    expect(matchesArticleSearchQuery(a, "author:doe")).toBe(true);
    expect(matchesArticleSearchQuery(a, "author:politico")).toBe(false);
    expect(matchesArticleSearchQuery(a, "title:election")).toBe(true);
    expect(matchesArticleSearchQuery(a, "title:jane")).toBe(false);
    expect(matchesArticleSearchQuery(a, "-feed:politico")).toBe(false);
  });

  it("ignores a bare field prefix with no term", () => {
    expect(matchesArticleSearchQuery(a, "feed:")).toBe(true);
  });

  it("searches the stored title, not rendered text (e.g. after MathJax)", () => {
    const math = article({ title: String.raw`Decomposition of $\mathrm{GL}_n$` });
    expect(matchesArticleSearchQuery(math, "gl")).toBe(true);
  });

  it("tolerates missing optional fields", () => {
    const sparse = article({ title: "Only title", description: undefined as unknown as string });
    expect(matchesArticleSearchQuery(sparse, "only")).toBe(true);
    expect(matchesArticleSearchQuery(sparse, "author:x")).toBe(false);
  });
});

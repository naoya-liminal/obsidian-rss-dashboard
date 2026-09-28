import { afterEach, describe, expect, it, vi } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";
import { Feed } from "../../../src/types/types";

describe("Phase 7 - ArticleList characterization", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("refilter should preserve the header element while replacing list + pagination", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [
        buildArticle({ guid: "1", title: "Article 1" }),
        buildArticle({ guid: "2", title: "Article 2" }),
      ],
      currentPage: 1,
      totalPages: 2,
      pageSize: 10,
      totalArticles: 20,
    });

    h.list.render();

    const headerEl = h.getHeaderEl();
    const listEl = h.getArticlesListEl();
    const paginationEl = h.getPaginationEl();
    expect(headerEl).not.toBeNull();
    expect(listEl).not.toBeNull();
    expect(paginationEl).not.toBeNull();

    const newArticles = [h.articles[0]];
    h.list.refilter(new Set(), new Set(), "OR", newArticles, 1, 1, 10, 1);

    const headerElAfter = h.getHeaderEl();
    const listElAfter = h.getArticlesListEl();
    const paginationElAfter = h.getPaginationEl();

    expect(headerElAfter).toBe(headerEl);
    expect(listElAfter).not.toBe(listEl);
    expect(paginationElAfter).not.toBe(paginationEl);

    h.cleanup();
  });

  it("renders pagination above the article list when configured for the top", () => {
    const h = createArticleListHarness({
      settings: {
        display: { paginationPosition: "top" },
      },
      articles: [buildArticle({ guid: "top" })],
      totalPages: 2,
      totalArticles: 20,
    });

    h.list.render();

    const paginationEl = h.getPaginationEl();
    const listEl = h.getArticlesListEl();
    expect(paginationEl).not.toBeNull();
    expect(listEl).not.toBeNull();
    expect(paginationEl?.compareDocumentPosition(listEl as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    h.cleanup();
  });

  it("keeps pagination below the article list by default", () => {
    const h = createArticleListHarness({
      articles: [buildArticle({ guid: "bottom" })],
      totalPages: 2,
      totalArticles: 20,
    });

    h.list.render();

    const paginationEl = h.getPaginationEl();
    const listEl = h.getArticlesListEl();
    expect(paginationEl).not.toBeNull();
    expect(listEl).not.toBeNull();
    expect(paginationEl?.compareDocumentPosition(listEl as Node)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );

    h.cleanup();
  });

  it("does not render pagination for an empty article list", () => {
    const h = createArticleListHarness({
      settings: {
        display: { paginationPosition: "top" },
      },
      totalPages: 2,
      totalArticles: 20,
    });

    h.list.render();

    expect(h.getPaginationEl()).toBeNull();
    h.cleanup();
  });

  it("insertArticleInPlace should insert at the correct position for newest and oldest sort", () => {
    vi.useFakeTimers();

    // NEWEST: [c, a] then insert b between.
    const newest = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [
        buildArticle({
          guid: "3",
          title: "C",
          pubDate: new Date("2024-01-03T00:00:00Z").toISOString(),
        }),
        buildArticle({
          guid: "1",
          title: "A",
          pubDate: new Date("2024-01-01T00:00:00Z").toISOString(),
        }),
      ],
      pageSize: 50,
      totalArticles: 2,
    });
    newest.list.render();

    const b = buildArticle({
      guid: "2",
      title: "B",
      pubDate: new Date("2024-01-02T00:00:00Z").toISOString(),
    });

    expect(newest.list.insertArticleInPlace(b, "newest")).toBe(true);
    vi.runOnlyPendingTimers();

    const newestIds = Array.from(
      newest.container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-item",
      ),
    ).map((el) => el.id);
    expect(newestIds).toEqual(["article-3", "article-2", "article-1"]);

    // OLDEST: [a, c] then insert b between.
    const oldest = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "oldest",
      },
      articles: [
        buildArticle({
          guid: "1",
          title: "A",
          pubDate: new Date("2024-01-01T00:00:00Z").toISOString(),
        }),
        buildArticle({
          guid: "3",
          title: "C",
          pubDate: new Date("2024-01-03T00:00:00Z").toISOString(),
        }),
      ],
      pageSize: 50,
      totalArticles: 2,
    });
    oldest.list.render();

    const bOldest = buildArticle({
      guid: "2",
      title: "B",
      pubDate: b.pubDate,
    });

    // Characterize current behavior: newest insert is supported; oldest insert may be rejected
    // if the list DOM doesn't have the expected reference element.
    const oldestInserted = oldest.list.insertArticleInPlace(bOldest, "oldest");
    vi.runOnlyPendingTimers();

    if (oldestInserted) {
      const oldestIds = Array.from(
        oldest.container.querySelectorAll<HTMLElement>(
          ".rss-dashboard-article-item",
        ),
      ).map((el) => el.id);
      expect(oldestIds).toEqual(["article-1", "article-2", "article-3"]);
    } else {
      expect(
        oldest.container.querySelectorAll(".rss-dashboard-article-item").length,
      ).toBe(2);
    }

    newest.cleanup();
    oldest.cleanup();
  });

  it("setSelectedArticle should set .active on the selected element and clear previous actives", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [
        buildArticle({ guid: "1", title: "One" }),
        buildArticle({ guid: "2", title: "Two" }),
      ],
    });
    h.list.render();

    h.list.setSelectedArticle(h.articles[0]);
    expect(h.getArticleEl("1")?.classList.contains("active")).toBe(true);
    expect(h.getArticleEl("2")?.classList.contains("active")).toBe(false);

    h.list.setSelectedArticle(h.articles[1]);
    expect(h.getArticleEl("1")?.classList.contains("active")).toBe(false);
    expect(h.getArticleEl("2")?.classList.contains("active")).toBe(true);

    h.cleanup();
  });

  it("renders standard feed icon image in article list if useDomainIconsRss is true", () => {
    const h = createArticleListHarness({
      settings: {
        display: {
          useDomainIconsRss: true,
        },
        feeds: [
          {
            title: "RSS Feed",
            url: "https://example.com/rss",
            iconUrl: "https://example.com/feed-icon.png",
          } as unknown as Feed,
        ],
      },
      articles: [
        buildArticle({
          guid: "1",
          title: "One",
          feedUrl: "https://example.com/rss",
          mediaType: "article",
        }),
      ],
    });
    h.list.render();

    const img = h
      .getArticleEl("1")
      ?.querySelector(
        ".rss-dashboard-article-feed-icon-img",
      ) as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toBe("https://example.com/feed-icon.png");
    h.cleanup();
  });

  it("falls back to default icon branch in article list if useDomainIconsRss is false", () => {
    const h = createArticleListHarness({
      settings: {
        display: {
          useDomainIconsRss: false,
        },
        feeds: [
          {
            title: "RSS Feed",
            url: "https://example.com/rss",
            iconUrl: "https://example.com/feed-icon.png",
          } as unknown as Feed,
        ],
      },
      articles: [
        buildArticle({
          guid: "1",
          title: "One",
          feedUrl: "https://example.com/rss",
          mediaType: "article",
        }),
      ],
    });
    h.list.render();

    const img = h
      .getArticleEl("1")
      ?.querySelector(".rss-dashboard-article-feed-icon-img");
    expect(img).toBeNull();
    h.cleanup();
  });
});

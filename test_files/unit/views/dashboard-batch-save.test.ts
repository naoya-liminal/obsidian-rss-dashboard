import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

// Keep platform-utils mocked so other tests that expect robustFetch to be a vi.fn
// (e.g. fetch-helpers.test.ts) don't end up importing the real module first.
vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

function cloneSettings(): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  // Exercise the plain saveArticle path deterministically in these tests;
  // full-content fetching is covered by article-saver's own tests.
  settings.articleSaving.saveFullContent = false;
  return settings;
}

function createItem(guid: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: `Article ${guid}`,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: new Date().toISOString(),
    guid,
    feedTitle: "Test Feed",
    feedUrl: "https://feed.test",
    coverImage: "",
    saved: false,
    ...overrides,
  };
}

function createFeed(items: FeedItem[]): Feed {
  return {
    title: "Test Feed",
    url: "https://feed.test",
    folder: "Uncategorized",
    items,
    lastUpdated: Date.now(),
  };
}

interface SaverMock {
  saveArticle: ReturnType<typeof vi.fn>;
  saveArticleWithFullContent: ReturnType<typeof vi.fn>;
}

interface PluginMock {
  settings: RssDashboardSettings;
  saveSettings: ReturnType<typeof vi.fn>;
}

async function createView(settings: RssDashboardSettings) {
  const { RssDashboardView } = await import("../../../src/views/dashboard-view");
  const app = new App();
  const plugin: PluginMock = {
    settings,
    saveSettings: vi.fn(async () => {}),
  };
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);

  // Replace the real ArticleSaver with a controllable mock; batch-save logic
  // only depends on its saveArticle/saveArticleWithFullContent signatures.
  const saver: SaverMock = {
    saveArticle: vi.fn(),
    saveArticleWithFullContent: vi.fn(),
  };
  (view as unknown as { saver: SaverMock }).saver = saver;

  // Prevent the real 0ms-deferred re-render (which exercises the full render
  // path, including saver.verifyAllSavedArticles) from firing after the test
  // completes — same technique dashboard-filter-persistence.test.ts uses.
  (view as unknown as { scheduleRender: () => void }).scheduleRender = vi.fn();

  return { view, plugin, saver };
}

describe("Dashboard batch save", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("saves only unsaved filtered articles and persists settings once", async () => {
    const settings = cloneSettings();
    settings.feeds = [
      createFeed([
        createItem("a", { saved: false }),
        createItem("b", { saved: true }),
        createItem("c", { saved: false }),
      ]),
    ];
    const { view, plugin, saver } = await createView(settings);
    saver.saveArticle.mockResolvedValue({ path: "RSS articles/x.md" });

    await view.actionSaveAllFilteredArticles();

    expect(saver.saveArticle).toHaveBeenCalledTimes(2);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);

    const items = settings.feeds[0].items;
    expect(items.find((i) => i.guid === "a")?.saved).toBe(true);
    expect(items.find((i) => i.guid === "a")?.savedFilePath).toBe(
      "RSS articles/x.md",
    );
    expect(items.find((i) => i.guid === "c")?.saved).toBe(true);
    // Already-saved article is skipped entirely, not re-saved.
    expect(items.find((i) => i.guid === "b")?.savedFilePath).toBeUndefined();
  });

  it("does nothing and shows a notice when there is nothing to save", async () => {
    const settings = cloneSettings();
    settings.feeds = [createFeed([createItem("a", { saved: true })])];
    const { view, plugin, saver } = await createView(settings);

    await view.actionSaveAllFilteredArticles();

    expect(saver.saveArticle).not.toHaveBeenCalled();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(console.debug).toHaveBeenCalledWith(
      "[Stub Notice]",
      "No articles to save in current view",
    );
  });

  it("keeps saving the rest when one article fails, and reports the partial failure", async () => {
    const settings = cloneSettings();
    settings.feeds = [
      createFeed([
        createItem("a", { saved: false }),
        createItem("b", { saved: false }),
      ]),
    ];
    const { view, plugin, saver } = await createView(settings);
    saver.saveArticle
      .mockResolvedValueOnce({ path: "RSS articles/a.md" })
      .mockRejectedValueOnce(new Error("boom"));

    await view.actionSaveAllFilteredArticles();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(console.debug).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Saved 1/2 articles (1 failed)",
    );
  });

  it("actionSaveSelectionArticles only touches selected guids and clears the selection", async () => {
    const settings = cloneSettings();
    settings.feeds = [
      createFeed([
        createItem("a", { saved: false }),
        createItem("b", { saved: false }),
        createItem("c", { saved: false }),
      ]),
    ];
    const { view, saver } = await createView(settings);
    saver.saveArticle.mockResolvedValue({ path: "RSS articles/x.md" });

    const typedView = view as unknown as { selectedArticleGuids: Set<string> };
    typedView.selectedArticleGuids = new Set(["a", "c"]);

    await view.actionSaveSelectionArticles();

    expect(saver.saveArticle).toHaveBeenCalledTimes(2);
    expect(
      settings.feeds[0].items.find((i) => i.guid === "b")?.savedFilePath,
    ).toBeUndefined();
    expect(typedView.selectedArticleGuids.size).toBe(0);
  });

  it("actionSelectAllFilteredArticles selects every currently filtered article", async () => {
    const settings = cloneSettings();
    settings.feeds = [
      createFeed([
        createItem("a", { saved: false }),
        createItem("b", { saved: true }),
        createItem("c", { saved: false }),
      ]),
    ];
    const { view } = await createView(settings);
    const typedView = view as unknown as { selectedArticleGuids: Set<string> };

    view.actionSelectAllFilteredArticles();

    expect(typedView.selectedArticleGuids).toEqual(new Set(["a", "b", "c"]));
  });

  it("actionSelectAllFilteredArticles shows a notice and selects nothing when the view is empty", async () => {
    const settings = cloneSettings();
    settings.feeds = [];
    const { view } = await createView(settings);
    const typedView = view as unknown as { selectedArticleGuids: Set<string> };

    view.actionSelectAllFilteredArticles();

    expect(typedView.selectedArticleGuids.size).toBe(0);
    expect(console.debug).toHaveBeenCalledWith(
      "[Stub Notice]",
      "No articles to select in current view",
    );
  });

  it("prunes selected guids that are no longer visible", async () => {
    const settings = cloneSettings();
    settings.feeds = [createFeed([createItem("a"), createItem("b")])];
    const { view } = await createView(settings);
    const typedView = view as unknown as {
      selectedArticleGuids: Set<string>;
      pruneSelectionToVisible: (visible: FeedItem[]) => void;
    };
    typedView.selectedArticleGuids = new Set(["a", "gone"]);

    typedView.pruneSelectionToVisible([createItem("a")]);

    expect(typedView.selectedArticleGuids.has("a")).toBe(true);
    expect(typedView.selectedArticleGuids.has("gone")).toBe(false);
  });
});

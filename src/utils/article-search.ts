import type { FeedItem } from "../types/types";

/**
 * Matches an article against a free-text search query.
 *
 * Syntax (case-insensitive):
 * - Space-separated terms are ANDed.
 * - `"quoted phrase"` matches the phrase as a whole.
 * - `-term` excludes articles containing the term.
 * - `feed:`, `author:`, `title:` restrict a term to that field.
 *
 * Unscoped terms search title, feed title, author, content, summary and description.
 */
export function matchesArticleSearchQuery(
  article: FeedItem,
  query: string,
): boolean {
  const tokens = (query.match(/"[^"]*"|\S+/g) || [])
    .map((t) => t.replace(/^"|"$/g, "").trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return true;

  const title = (article.title || "").toLowerCase();
  const feedTitle = (article.feedTitle || "").toLowerCase();
  const author = (article.author || "").toLowerCase();
  const body = (
    (article.content || "") +
    " " +
    (article.summary || "") +
    " " +
    (article.description || "")
  ).toLowerCase();
  const all = `${title} ${feedTitle} ${author} ${body}`;

  for (const raw of tokens) {
    const negate = raw.startsWith("-") && raw.length > 1;
    let term = (negate ? raw.slice(1) : raw).toLowerCase();
    let field = all;
    if (term.startsWith("feed:")) {
      field = feedTitle;
      term = term.slice(5);
    } else if (term.startsWith("author:")) {
      field = author;
      term = term.slice(7);
    } else if (term.startsWith("title:")) {
      field = title;
      term = term.slice(6);
    }
    if (!term) continue;

    const found = field.includes(term);
    if (negate && found) return false;
    if (!negate && !found) return false;
  }
  return true;
}

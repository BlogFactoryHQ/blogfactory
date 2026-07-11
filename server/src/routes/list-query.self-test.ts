import assert from "node:assert/strict";
import { LIST_DEFAULT_PAGE_SIZE, LIST_MAX_PAGE_SIZE, pagination, parseJobListQuery, parsePostListQuery } from "./list-query.js";

assert.deepEqual(parsePostListQuery({}), { page: 1, limit: LIST_DEFAULT_PAGE_SIZE, sort: "created_at", direction: "desc" });
assert.deepEqual(parsePostListQuery({ page: "3", limit: "999", search: " launch ", status: "draft", sourceType: "rss", modelId: "model", personaId: "none", campaignId: "campaign", sort: "title", direction: "asc" }), {
  page: 3, limit: LIST_MAX_PAGE_SIZE, search: "launch", status: "draft", sourceType: "rss", modelId: "model", personaId: null, campaignId: "campaign", sort: "title", direction: "asc",
});
assert.deepEqual(parseJobListQuery({ page: "0", limit: "bad", status: "running", search: " abc ", siteId: "site" }), {
  page: 1, limit: LIST_DEFAULT_PAGE_SIZE, status: "running", search: "abc", siteId: "site",
});
assert.deepEqual(pagination(2, 25, 51), { page: 2, limit: 25, total: 51, pages: 3 });
assert.deepEqual(pagination(1, 25, 0), { page: 1, limit: 25, total: 0, pages: 1 });

console.log("list query self-check passed");

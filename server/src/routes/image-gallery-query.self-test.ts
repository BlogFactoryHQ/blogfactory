import assert from "node:assert/strict";
import { IMAGE_GALLERY_DEFAULT_PAGE_SIZE, IMAGE_GALLERY_MAX_PAGE_SIZE, parseImageGalleryQuery } from "./image-gallery-query.js";

const now = new Date("2026-07-11T12:00:00Z");
assert.deepEqual(parseImageGalleryQuery({}, now), { page: 1, limit: IMAGE_GALLERY_DEFAULT_PAGE_SIZE });

const parsed = parseImageGalleryQuery({
  page: "3",
  limit: "999",
  type: "cover",
  status: "unused",
  postStatus: "draft",
  dateRange: "30d",
  aspectRatio: " 16:9 ",
  search: "  product launch ",
}, now);
assert.equal(parsed.page, 3);
assert.equal(parsed.limit, IMAGE_GALLERY_MAX_PAGE_SIZE);
assert.equal(parsed.type, "cover");
assert.equal(parsed.status, "unused");
assert.equal(parsed.postStatus, "draft");
assert.equal(parsed.aspectRatio, "16:9");
assert.equal(parsed.search, "product launch");
assert.equal(parsed.createdAfter?.toISOString(), "2026-06-11T12:00:00.000Z");

assert.deepEqual(parseImageGalleryQuery({ page: "-4", limit: "bad", type: "video", status: "gone", postStatus: "all", dateRange: "year" }, now), {
  page: 1,
  limit: IMAGE_GALLERY_DEFAULT_PAGE_SIZE,
});

console.log("image gallery query self-check passed");

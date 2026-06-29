import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { imageAssets, imageGenerationRequests, posts } from "../db/schema.js";
import { removeInlineImagePath } from "./image-placement.js";

const apply = process.argv.includes("--apply");

type DuplicateRow = {
  inlineAssetId: string;
  inlinePath: string;
  postId: string;
  postContent: string | null;
  postInlineImages: string[] | null;
};

async function repairCoverStockFallbacks() {
  const badCoverRequests = await db
    .select({
      id: imageGenerationRequests.id,
    })
    .from(imageGenerationRequests)
    .where(and(
      eq(imageGenerationRequests.type, "cover"),
      eq(imageGenerationRequests.provider, "stock-fallback")
    ));

  console.log(`${apply ? "Repairing" : "Would repair"} ${badCoverRequests.length} cover requests completed via stock fallback`);
  if (!apply) return badCoverRequests.length;

  for (const request of badCoverRequests) {
    await db.update(imageGenerationRequests).set({
      provider: "ai-deferred",
      status: "queued",
      fallbackPolicy: "none",
      completedVia: null,
      lastError: "Requeued because cover requests must not complete via stock fallback",
      importedAssetId: null,
      retryCount: 0,
      availableAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(imageGenerationRequests.id, request.id));
  }
  return badCoverRequests.length;
}

async function duplicateInlineRows() {
  const result = await db.execute(sql`
    select
      inline_asset.id as "inlineAssetId",
      inline_asset.storage_path as "inlinePath",
      inline_asset.post_id as "postId",
      post.content as "postContent",
      post.inline_images as "postInlineImages"
    from image_assets cover_asset
    join image_assets inline_asset
      on inline_asset.post_id = cover_asset.post_id
      and inline_asset.user_id = cover_asset.user_id
      and inline_asset.type = 'inline'
      and inline_asset.status = 'used'
      and inline_asset.source_url is not null
      and cover_asset.source_url is not null
      and inline_asset.source_url = cover_asset.source_url
      and coalesce(inline_asset.provider, '') = coalesce(cover_asset.provider, '')
    join posts post on post.id = inline_asset.post_id
    where cover_asset.type = 'cover'
      and cover_asset.status = 'used'
  `);
  return (((result as any).rows || result) as DuplicateRow[]);
}

async function detachDuplicateInlines() {
  const rows = await duplicateInlineRows();
  console.log(`${apply ? "Detaching" : "Would detach"} ${rows.length} inline assets that duplicate the cover stock source`);
  if (!apply) return rows.length;

  for (const row of rows) {
    const nextInlineImages = (row.postInlineImages || []).filter((path) => path !== row.inlinePath);
    await db.update(posts).set({
      inlineImages: nextInlineImages,
      content: removeInlineImagePath(row.postContent || "", row.inlinePath),
      updatedAt: new Date(),
    }).where(eq(posts.id, row.postId));
    await db.update(imageAssets).set({
      postId: null,
      status: "unused",
    }).where(eq(imageAssets.id, row.inlineAssetId));
  }
  return rows.length;
}

async function main() {
  console.log(`Image flow repair (${apply ? "apply" : "dry-run"})`);
  const repaired = await repairCoverStockFallbacks();
  const detached = await detachDuplicateInlines();
  console.log(`Done: cover requests ${repaired}, duplicate inline assets ${detached}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

export type ImagePlacement = "auto" | "featured_only" | "after_intro" | "between_sections";

export interface PlacementImage {
  url: string;
  altText?: string | null;
}

const VALID_PLACEMENTS = new Set<ImagePlacement>(["auto", "featured_only", "after_intro", "between_sections"]);

export function normalizeImagePlacement(value: unknown): ImagePlacement {
  return typeof value === "string" && VALID_PLACEMENTS.has(value as ImagePlacement)
    ? value as ImagePlacement
    : "auto";
}

export function imageFigureMarkdown(url: string, altText?: string | null) {
  const alt = (altText || "Article image").replace(/[\]\n\r]/g, " ").trim();
  return `![${alt}](${url})`;
}

function imageBlocks(images: PlacementImage[]) {
  return images.map((image) => imageFigureMarkdown(image.url, image.altText)).join("\n\n");
}

function insertAfterIntro(markdown: string, images: PlacementImage[]) {
  const blocks = markdown.split(/\n{2,}/);
  const index = blocks.findIndex((block) => {
    const trimmed = block.trim();
    return trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("![");
  });
  if (index < 0) return `${markdown}\n\n${imageBlocks(images)}`.trim();
  blocks.splice(index + 1, 0, imageBlocks(images));
  return blocks.join("\n\n");
}

function insertBetweenSections(markdown: string, images: PlacementImage[]) {
  const lines = markdown.split(/\r?\n/);
  const headingIndexes = lines
    .map((line, index) => line.match(/^##\s+/) ? index : -1)
    .filter((index) => index >= 0);
  if (!headingIndexes.length) return `${markdown}\n\n${imageBlocks(images)}`.trim();

  const inserts = new Map<number, PlacementImage[]>();
  images.forEach((image, index) => {
    const headingIndex = headingIndexes[Math.min(index, headingIndexes.length - 1)];
    inserts.set(headingIndex, [...(inserts.get(headingIndex) || []), image]);
  });

  const out: string[] = [];
  lines.forEach((line, index) => {
    const imagesBeforeHeading = inserts.get(index);
    if (imagesBeforeHeading?.length) out.push("", imageBlocks(imagesBeforeHeading), "");
    out.push(line);
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function placeInlineImages(markdown: string, images: PlacementImage[], placement: ImagePlacement) {
  if (!images.length || placement === "featured_only") return markdown;
  if (placement === "after_intro") return insertAfterIntro(markdown, images);
  if (placement === "between_sections") return insertBetweenSections(markdown, images);
  return images.length <= 1 ? markdown : insertBetweenSections(markdown, images);
}

import assert from "node:assert/strict";
import { chunkKnowledgeContent, retrieveKnowledgeChunks } from "./knowledge.js";

const chunks = chunkKnowledgeContent("# Product\n\nAlpha CRM has pipeline automation and lead scoring.\n\n# Billing\n\nThe starter plan costs $29 per seat.", 80);

assert.equal(chunks.length, 2);

const retrieved = retrieveKnowledgeChunks([
  { title: "Product spec", status: "ready", chunks },
  { title: "Draft", status: "processing", content: "Pipeline automation should not appear from processing docs." },
], "best crm pipeline automation", 1);

assert.equal(retrieved.length, 1);
assert.match(retrieved[0], /Alpha CRM/);
assert.doesNotMatch(retrieved[0], /starter plan/);

const fallback = retrieveKnowledgeChunks([
  { title: "Brand template", status: "ready", content: "Use a compact alternatives article format with verdict sections." },
], "unrelated source tokens", 1);

assert.equal(fallback.length, 1);
assert.match(fallback[0], /alternatives article format/);

console.log("knowledge self-test ok");

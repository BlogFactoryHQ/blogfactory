import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("..", import.meta.url));
const files = readdirSync(source, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => join(entry.parentPath, entry.name));
const violations = files.filter((file) => !file.endsWith("managed-openrouter.ts") && /fetch\([`"]https:\/\/openrouter\.ai\/api\/v1\/(?:chat\/completions|images)[`"]/.test(readFileSync(file, "utf8")));
assert.deepEqual(violations, [], `OpenRouter inference must use managed-openrouter.ts: ${violations.join(", ")}`);
console.log("OpenRouter inference boundary self-test passed");

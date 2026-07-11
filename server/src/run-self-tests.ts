import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = join(sourceRoot, "../..");

function discoverSelfTests(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverSelfTests(path);
    return entry.isFile() && entry.name.endsWith(".self-test.ts") ? [path] : [];
  });
}

const tests = discoverSelfTests(sourceRoot).sort();
if (tests.length === 0) {
  console.error("No backend self-tests were discovered.");
  process.exit(1);
}

console.log(`Running ${tests.length} backend self-tests...`);
const failures: string[] = [];

for (const test of tests) {
  const label = relative(repositoryRoot, test);
  const child = Bun.spawn([process.execPath, "run", test], {
    cwd: repositoryRoot,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode === 0) console.log(`PASS ${label}`);
  else {
    console.error(`FAIL ${label} (exit ${exitCode})`);
    failures.push(label);
  }
}

if (failures.length) {
  console.error(`${failures.length}/${tests.length} backend self-tests failed.`);
  process.exit(1);
}

console.log(`All ${tests.length} backend self-tests passed.`);

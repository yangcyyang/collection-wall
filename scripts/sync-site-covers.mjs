import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

async function syncCovers(from, to) {
  await rm(to, { recursive: true, force: true });
  await mkdir(to, { recursive: true });
  try {
    await cp(from, to, { recursive: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await syncCovers(join(repoRoot, "data/tools/covers"), join(repoRoot, "site/public/covers"));
await syncCovers(join(repoRoot, "data/skills/covers"), join(repoRoot, "site/public/skills/covers"));

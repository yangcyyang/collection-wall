import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type PromptImage = {
  url: string;
  poster?: string;
};

export type PromptItem = {
  id: string;
  author: string;
  url: string;
  created_at: string;
  text: string;
  prompt: string;
  images: PromptImage[];
};

export type PromptSource = {
  source: string;
  title: string;
  updated_at: string;
  count: number;
  items: PromptItem[];
};

export type PromptSet = {
  id: string;
  author: string;
  tweetUrl: string;
  prompt: string;
  createdAt: string;
  source: string;
  images: string[];
};

const promptsDirectory = resolve(process.cwd(), "../data/prompts");

function handleAt(author: string) {
  const name = author.trim().replace(/^@/, "");
  return name ? `@${name}` : "";
}

export function formatPromptEyebrow(sets: Pick<PromptSet, "author">[]) {
  const authors = [...new Set(sets.map((set) => handleAt(set.author)).filter(Boolean))];
  const lead = authors.join(" · ") || "生图提示词";
  return authors.length ? `${lead} · 生图提示词` : lead;
}

export function imageCount(sets: PromptSet[]) {
  return sets.reduce((sum, set) => sum + set.images.length, 0);
}

export function groupPromptSets(sources: PromptSource[]): PromptSet[] {
  const sets: PromptSet[] = [];
  for (const file of sources) {
    for (const item of file.items ?? []) {
      const images = (item.images ?? []).map((image) => image.url).filter(Boolean);
      if (!images.length) continue;
      sets.push({
        id: item.id,
        author: item.author,
        tweetUrl: item.url,
        prompt: item.prompt,
        createdAt: item.created_at,
        source: file.source,
        images,
      });
    }
  }
  return sets.sort((a, b) => {
    const time = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return time !== 0 ? time : b.id.localeCompare(a.id);
  });
}

export async function getPromptSources(): Promise<PromptSource[]> {
  let files: string[] = [];
  try {
    files = await readdir(promptsDirectory);
  } catch {
    return [];
  }

  const sources = await Promise.all(files
    .filter((file) => file.endsWith(".json"))
    .map(async (file) => JSON.parse(await readFile(resolve(promptsDirectory, file), "utf8")) as PromptSource));

  return sources.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
}

export async function getPromptSets(): Promise<PromptSet[]> {
  return groupPromptSets(await getPromptSources());
}

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { inferPromptType } from "./prompt-type.mjs";

export { formatPromptEyebrow } from "./prompt-gallery.mjs";
export { inferPromptType, promptTypeFilters, sourceLinkLabel, promptFacets, promptFacetFilters } from "./prompt-type.mjs";

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

/** Local collector for xiaoxiaodong01.json: pipeline/xiaoxiaodong_collect.py */
export type PromptSource = {
  source: string;
  title: string;
  updated_at: string;
  count: number;
  items: PromptItem[];
};

export type PromptType = "海报" | "插画" | "人像" | "静物" | "风景" | "字体" | "品牌" | "信息图" | "UI" | "产品" | "场景" | "未分类";

export type PromptSet = {
  id: string;
  author: string;
  tweetUrl: string;
  prompt: string;
  createdAt: string;
  source: string;
  type: PromptType;
  images: string[];
};

const promptsDirectory = resolve(process.cwd(), "../data/prompts");

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
        type: inferPromptType(item.text, item.prompt, item.url) as PromptType,
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

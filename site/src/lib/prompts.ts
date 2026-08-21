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

export type PromptCard = {
  id: string;
  cardId: string;
  author: string;
  tweetUrl: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
  source: string;
  imageIndex: number;
};

const promptsDirectory = resolve(process.cwd(), "../data/prompts");

function handleAt(author: string) {
  const name = author.trim().replace(/^@/, "");
  return name ? `@${name}` : "";
}

export function formatPromptEyebrow(cards: PromptCard[]) {
  const authors = [...new Set(cards.map((card) => handleAt(card.author)).filter(Boolean))];
  const lead = authors.join(" · ") || "生图提示词";
  return authors.length ? `${lead} · 生图提示词` : lead;
}

export function flattenPromptCards(sources: PromptSource[]): PromptCard[] {
  const cards: PromptCard[] = [];
  for (const file of sources) {
    for (const item of file.items ?? []) {
      (item.images ?? []).forEach((image, imageIndex) => {
        if (!image?.url) return;
        cards.push({
          id: item.id,
          cardId: `${item.id}-${imageIndex}`,
          author: item.author,
          tweetUrl: item.url,
          prompt: item.prompt,
          imageUrl: image.url,
          createdAt: item.created_at,
          source: file.source,
          imageIndex,
        });
      });
    }
  }
  return cards.sort((a, b) => {
    const time = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (time !== 0) return time;
    if (a.id !== b.id) return b.id.localeCompare(a.id);
    return a.imageIndex - b.imageIndex;
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

export async function getPromptCards(): Promise<PromptCard[]> {
  return flattenPromptCards(await getPromptSources());
}

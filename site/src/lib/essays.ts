export {
  ESSAY_KINDS,
  essayKindFilters,
  essayKindLabel,
  essaySearchBlob,
  getEssay,
  getEssaysFeed,
  normalizeEssay,
  renderEssayMarkdown,
} from "./essays.mjs";

export type EssayKind = "translation" | "original";

export type EssayItem = {
  id: string;
  kind: EssayKind;
  kind_label: string;
  title: string;
  title_en?: string;
  author?: string;
  author_handle?: string;
  published_at?: string;
  source_url?: string;
  article_url?: string;
  blog_url?: string;
  summary?: string;
  body_file: string;
  capture_status: "full" | "partial";
};

export type EssayFeed = {
  source: string;
  title: string;
  description: string;
  updated_at: string;
  count: number;
  items: EssayItem[];
};

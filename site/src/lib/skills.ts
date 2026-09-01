export {
  MARKETPLACE_CATEGORIES,
  categoryFilters,
  formatGithubStars,
  getSkills,
  getSkillsFeed,
  matchesSkill,
  skillSearchBlob,
  skillStars,
} from "./skills.mjs";

export type SkillItem = {
  id: string;
  slug: string;
  title: string;
  title_zh?: string;
  title_en?: string;
  headline?: string;
  description?: string;
  author?: string;
  github_url?: string;
  stars?: number | null;
  github_stars?: number | null;
  category_keys?: string[];
  categories?: string[];
  tags?: string[];
  license?: string;
  source_url?: string;
  detail_url?: string;
  cover?: string;
  cover_source?: string;
  preview_image_urls?: string[];
  example_prompts?: string[];
  certification?: string;
  listing_kind?: string;
  is_installable?: boolean;
  install_url?: string;
  featured?: boolean;
};

export type SkillFeed = {
  source: string;
  title: string;
  updated_at: string;
  count: number;
  items: SkillItem[];
};

export {
  MARKETPLACE_CATEGORIES,
  categoryFilters,
  formatGithubStars,
  getSkills,
  getSkillsFeed,
  matchesSkill,
  skillSearchBlob,
} from "./skills.mjs";

export type SkillItem = {
  id: string;
  slug: string;
  title: string;
  headline?: string;
  author?: string;
  github_url?: string;
  github_stars?: number | null;
  categories?: string[];
  license?: string;
  detail_url?: string;
  cover?: string;
  cover_source?: string;
  example_prompts?: string[];
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

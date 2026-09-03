export {
  flattenSectionItems,
  getRecentReportDates,
  getSectionItems,
  getSidehustleFeed,
  getSidehustleItemById,
  hasReportContent,
  SECTION_KEYS,
  SECTION_LABELS,
  sidehustleIndexLabel,
  sidehustleLevelClass,
  sidehustleLevelLabel,
  sidehustleModelClass,
  sidehustleModelLabel,
  sidehustleSignalClass,
  sidehustleSignalLabel,
} from "./sidehustle.mjs";

export type SidehustleModel = "service" | "digital" | "traffic";
export type SidehustleLevel = "low" | "mid" | "high";
export type SidehustleSignal = "strong" | "mid" | "weak";

export type SidehustleEvidence = {
  url?: string;
  title?: string;
  note?: string;
};

export type SidehustleItem = {
  id: string;
  title: string;
  summary: string;
  why?: string;
  audience?: string;
  result?: string;
  offer?: string;
  model?: SidehustleModel | string;
  ai_help?: string;
  start_cost?: SidehustleLevel | string;
  delivery?: SidehustleLevel | string;
  competition?: SidehustleLevel | string;
  index?: number | "";
  tags?: string[];
  signal_strength?: SidehustleSignal | string;
  evidence?: SidehustleEvidence[];
  first_detected?: string;
  last_updated?: string;
  section?: string;
  key?: string;
};

export type SidehustleSummary = {
  today_judgement: string[];
  top_signals: string[];
};

export type SidehustleSections = {
  opportunities: SidehustleItem[];
  new_demands: SidehustleItem[];
  pay_signals: SidehustleItem[];
  ai_leverage: SidehustleItem[];
  digital_products: SidehustleItem[];
  services: SidehustleItem[];
  content: SidehustleItem[];
  to_validate: SidehustleItem[];
};

export type SidehustleFeed = {
  source: string;
  title: string;
  date: string;
  updated_at: string;
  count: number;
  summary: SidehustleSummary;
  sections: SidehustleSections;
};

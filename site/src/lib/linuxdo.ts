export {
  getDigestFeed,
  getItemById,
  getItems,
  getRecentReportDates,
  hasDigestContent,
  itemsByGroup,
  linuxdoLikesLabel,
  linuxdoViewsLabel,
} from "./linuxdo.mjs";

export type LinuxdoGroup = "hot" | "share" | "";

export type LinuxdoItem = {
  id: string;
  group: LinuxdoGroup;
  title: string;
  likes: number | null;
  views: number | null;
  why: string;
  url: string;
};

export type LinuxdoFeed = {
  source: string;
  title: string;
  date: string;
  updated_at: string;
  count: number;
  hot: LinuxdoItem[];
  share: LinuxdoItem[];
  items: LinuxdoItem[];
};

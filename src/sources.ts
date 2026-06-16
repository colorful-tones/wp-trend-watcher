export type SourceTier = 1 | 2;

export type Source = {
  id: string;
  name: string;
  url: string;
  feedUrl: string;
  tier: SourceTier;
};

export const sources: Source[] = [
  {
    id: "wordpress-developer-blog",
    name: "WordPress Developer Blog",
    url: "https://developer.wordpress.org/news/",
    feedUrl: "https://developer.wordpress.org/news/feed/",
    tier: 1,
  },
  {
    id: "make-core",
    name: "Make Core",
    url: "https://make.wordpress.org/core/",
    feedUrl: "https://make.wordpress.org/core/feed/",
    tier: 1,
  },
  {
    id: "wordpress-org-news",
    name: "WordPress.org News",
    url: "https://wordpress.org/news/",
    feedUrl: "https://wordpress.org/news/feed/",
    tier: 1,
  },
  {
    id: "acf-blog",
    name: "ACF Blog",
    url: "https://www.advancedcustomfields.com/blog/",
    feedUrl: "https://www.advancedcustomfields.com/blog/feed/",
    tier: 1,
  },
  {
    id: "gutenberg-times",
    name: "Gutenberg Times",
    url: "https://gutenbergtimes.com/",
    feedUrl: "https://gutenbergtimes.com/feed/",
    tier: 2,
  },
  {
    id: "acf-chat-fridays",
    name: "ACF Chat Fridays",
    url: "https://www.advancedcustomfields.com/blog/tag/acf-chat-fridays/",
    feedUrl: "https://www.advancedcustomfields.com/blog/tag/acf-chat-fridays/feed/",
    tier: 2,
  },
];

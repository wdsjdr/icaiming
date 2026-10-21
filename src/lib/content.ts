import { parse } from 'yaml';
import { z } from 'zod';

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const parsed = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === v;
}, '日期无效');
const webLink = z.string().url().refine((v) => ['http:', 'https:'].includes(new URL(v).protocol), '链接须为 HTTP(S) 地址');
const link = z.union([webLink, z.string().regex(/^\/(?!\/)[^\\\s]*$/)]);
export const postSchema = z.object({
  title: z.string().min(1), description: z.string().min(1), date,
  tags: z.array(z.string().min(1)).default([]), draft: z.boolean().default(false),
});
export type Post = z.infer<typeof postSchema> & { slug: string; readingMinutes: number };
export const profileSchema = z.object({
  name: z.string(), tagline: z.string(), bio: z.string(), email: z.string().email(),
  socials: z.array(z.object({ id: z.enum(['github', 'bilibili', 'douyin', 'heybox']), label: z.string(), url: webLink })),
});
export const homeSchema = z.object({ eyebrow: z.string(), introduction: z.string(), status: z.string() });
export const projectsSchema = z.object({ items: z.array(z.object({
  title: z.string(), description: z.string(), status: z.string(), url: link, tags: z.array(z.string()),
})) });
export const resourcesSchema = z.object({ items: z.array(z.object({
  title: z.string(), description: z.string(), category: z.string(), url: webLink, tags: z.array(z.string()),
})) });
const downloadPath = z.string().regex(/^(?:assets|downloads)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/, '下载文件路径不合法');
export const downloadsSchema = z.object({ items: z.array(z.object({
  title: z.string().min(1), description: z.string().min(1), category: z.string().min(1),
  file: downloadPath.optional(), url: webLink.optional(),
  size: z.string().optional(), updated: date.optional(), tags: z.array(z.string()).default([]),
}).superRefine((item, ctx) => {
  // Exactly one target: a file hosted on this site, or an external download link.
  if (Boolean(item.file) === Boolean(item.url)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: '需恰好填写本地文件（assets/ 或 downloads/）或外部链接其中之一' });
  }
})) });
export const rankingsSchema = z.object({
  updatedAt: z.string().nullable().default(null),
  weights: z.record(z.number()).default({}),
  items: z.array(z.object({
    rank: z.number().int().positive(), name: z.string().min(1), vendor: z.string().optional(),
    score: z.number().min(0).max(1), raw: z.number().optional(),
    sources: z.record(z.number().min(0).max(1)).default({}), url: webLink.optional(),
    tags: z.array(z.string()).default([]),
  })),
});
export const hotboardIndexSchema = z.object({
  updatedAt: z.string().nullable().default(null),
  platforms: z.array(z.object({
    type: z.string().min(1), label: z.string().min(1),
    updateAt: z.string().nullable().default(null), count: z.number().int().nonnegative().default(0),
  })).default([]),
});
export const hotboardSchema = z.object({
  type: z.string().min(1),
  updateAt: z.string().nullable().default(null),
  items: z.array(z.object({
    index: z.number().int().positive(), title: z.string().min(1), hotValue: z.string().default(''),
    url: webLink, cover: webLink.optional(),
  })).default([]),
});
export const epicFreeSchema = z.object({
  updatedAt: z.string().nullable().default(null),
  items: z.array(z.object({
    id: z.string().min(1), title: z.string().min(1), cover: webLink.optional(),
    originalPrice: z.number().optional(), originalPriceDesc: z.string().default(''),
    description: z.string().default(''), seller: z.string().default(''), isFreeNow: z.boolean().default(true),
    freeStartAt: z.number().optional(), freeEndAt: z.number().optional(),
    freeStart: z.string().optional(), freeEnd: z.string().optional(), link: webLink,
  })).default([]),
});
export const steamDealSchema = z.object({
  appid: z.number().int(),
  nameEn: z.string().default(''), nameZh: z.string().default(''),
  url: webLink, capsule: z.string().default(''), header: z.string().default(''),
  original: z.number().min(0).default(0), final: z.number().min(0).default(0),
  discount: z.number().int().min(0).max(100).default(0),
  reviewText: z.string().default(''),
  reviewPercent: z.number().int().min(0).max(100).nullable().default(null),
  reviewCount: z.number().int().nonnegative().default(0),
  rating: z.number().nullable().default(null),
  isLow: z.boolean().default(false), isNewLow: z.boolean().default(false),
  lowPrice: z.number().min(0).nullable().default(null),
  endsAt: z.string().nullable().default(null),
});
export const steamDealsSchema = z.object({
  updatedAt: z.string().nullable().default(null),
  sourceUpdatedAt: z.string().nullable().default(null),
  items: z.array(steamDealSchema).default([]),
});
export const sayingSchema = z.object({
  updatedAt: z.string().nullable().default(null),
  items: z.array(z.string().min(1)).default([]),
});
export const answerbookSchema = z.object({ question: z.string(), answer: z.string().min(1) });
export const dailyNewsSchema = z.object({
  updatedAt: z.string().nullable().default(null),
  dates: z.array(date).default([]),
});
export const resumeSchema = z.object({
  name: z.string(), title: z.string(), summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(z.object({ title: z.string(), organization: z.string(), period: z.string(), description: z.string() })),
  education: z.array(z.object({ title: z.string(), organization: z.string(), period: z.string(), description: z.string() })),
  pdf: z.string().regex(/^resume\/[a-zA-Z0-9_-]+\.pdf$/).nullable().default(null),
});
export type Profile = z.infer<typeof profileSchema>;
export type Home = z.infer<typeof homeSchema>;
export type Projects = z.infer<typeof projectsSchema>;
export type Resources = z.infer<typeof resourcesSchema>;
export type Downloads = z.infer<typeof downloadsSchema>;
export type Rankings = z.infer<typeof rankingsSchema>;
export type HotboardIndex = z.infer<typeof hotboardIndexSchema>;
export type Hotboard = z.infer<typeof hotboardSchema>;
export type EpicFree = z.infer<typeof epicFreeSchema>;
export type SteamDeal = z.infer<typeof steamDealSchema>;
export type SteamDeals = z.infer<typeof steamDealsSchema>;
export type Saying = z.infer<typeof sayingSchema>;
export type Answerbook = z.infer<typeof answerbookSchema>;
export type DailyNews = z.infer<typeof dailyNewsSchema>;
export type Resume = z.infer<typeof resumeSchema>;

export function parsePost(raw: string, slug: string) {
  if (!slugPattern.test(slug)) throw new Error(`不合法的文章 slug：${slug}`);
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) throw new Error(`${slug} 缺少 YAML frontmatter`);
  const meta = postSchema.parse(parse(match[1], { schema: 'core', maxAliasCount: 50 }));
  const body = raw.slice(match[0].length);
  if (!body.trim()) throw new Error(`${slug} 正文为空`);
  const readingMinutes = Math.max(1, Math.ceil(body.replace(/\s/g, '').length / 400));
  return { meta: { ...meta, slug, readingMinutes } satisfies Post, body };
}

// Post dates are calendar days in the site time zone (Asia/Shanghai, UTC+8), not UTC:
// a post dated today in China should go live at Beijing midnight rather than at UTC midnight.
const siteDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

function siteDate(now: Date) {
  // Build the YYYY-MM-DD string from parts so the result never depends on locale output ordering.
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of siteDateFormatter.formatToParts(now)) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isPublished(post: Pick<Post, 'draft' | 'date'>, now = new Date()) {
  return !post.draft && post.date <= siteDate(now);
}

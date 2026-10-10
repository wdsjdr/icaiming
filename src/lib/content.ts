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

export function isPublished(post: Pick<Post, 'draft' | 'date'>, now = new Date()) {
  return !post.draft && post.date <= now.toISOString().slice(0, 10);
}

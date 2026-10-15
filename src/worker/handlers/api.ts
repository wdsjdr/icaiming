import { cacheControl, errorResponse, HttpError, readJson, readPost, readPosts, type Env } from '../../server/r2';
import { decodeParam, type Handler } from '../shared';

// Explicit Map instead of a plain object so names such as "constructor" never match inherited properties.
const collectionKeys = new Map<string, string>([
  ['profile', 'site/profile.json'], ['home', 'site/home.json'], ['projects', 'projects/index.json'],
  ['resume', 'resume/resume.json'], ['resources', 'resources/index.json'],
  ['downloads', 'downloads/index.json'], ['rankings', 'rankings/combined.json'],
  ['epic-free', 'misc/epic-free.json'], ['saying', 'misc/saying.json'],
  ['steam-deals', 'misc/steam-deals.json'],
]);
const hotboardTypes = ['bilibili', 'weibo', 'toutiao', 'douyin', 'netease-music', 'history', 'weatheralarm'];

export const postList: Handler = async (_request, env) => {
  try { return Response.json({ posts: await readPosts(env) }, { headers: { 'Cache-Control': cacheControl(env) } }); }
  catch (error) { return errorResponse(error); }
};

export const postBySlug: Handler = async (_request, env, params) => {
  try {
    const post = await readPost(env, decodeParam(params[0]));
    return new Response(post.raw, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': cacheControl(env), ETag: post.etag } });
  } catch (error) { return errorResponse(error); }
};

export const collection: Handler = async (_request, env, params) => {
  try {
    const key = collectionKeys.get(decodeParam(params[0]));
    if (!key) throw new HttpError(404, '接口不存在');
    return Response.json(await readJson(env, key), { headers: { 'Cache-Control': cacheControl(env) } });
  } catch (error) { return errorResponse(error); }
};

export const hotboard: Handler = async (request, env) => {
  try {
    const type = new URL(request.url).searchParams.get('type');
    if (type && !hotboardTypes.includes(type)) throw new HttpError(404, '未知的热榜平台');
    const key = type ? `misc/hotboard/${type}.json` : 'misc/hotboard/index.json';
    return Response.json(await readJson(env, key), { headers: { 'Cache-Control': cacheControl(env) } });
  } catch (error) { return errorResponse(error); }
};

const dailyNewsKeyPattern = /^misc\/daily-news\/(\d{4}-\d{2}-\d{2})\.jpg$/;

export const dailyNews: Handler = async (_request, env) => {
  try {
    if (!env.CONTENT_BUCKET) throw new HttpError(503, '内容服务尚未配置');
    const dates: string[] = [];
    let updatedAt: string | null = null;
    let cursor: string | undefined;
    do {
      const listed = await env.CONTENT_BUCKET.list({ prefix: 'misc/daily-news/', cursor });
      for (const object of listed.objects) {
        const match = dailyNewsKeyPattern.exec(object.key);
        if (!match) continue;
        dates.push(match[1]);
        const uploaded = object.uploaded.toISOString();
        if (!updatedAt || uploaded > updatedAt) updatedAt = uploaded;
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    dates.sort((a, b) => b.localeCompare(a));
    return Response.json({ updatedAt, dates }, { headers: { 'Cache-Control': cacheControl(env) } });
  } catch (error) { return errorResponse(error); }
};

export const answerbook: Handler = async (request, env) => {
  try {
    const question = (new URL(request.url).searchParams.get('q') ?? '').trim();
    if (!question) throw new HttpError(400, '请先写下你的问题');
    if (question.length > 100) throw new HttpError(400, '问题有点长，精简一点再问');
    const headers: Record<string, string> = { 'User-Agent': 'ic-aiming/1.0 (+https://github.com/wdsjdr/icaiming)' };
    if (env.UAPI_KEY) headers.Authorization = `Bearer ${env.UAPI_KEY}`;
    const response = await fetch(`https://uapis.cn/api/v1/answerbook/ask?question=${encodeURIComponent(question)}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new HttpError(502, '答案之书暂时沉默，稍后再问一次');
    const data = await response.json() as { question?: string; answer?: string };
    if (!data.answer) throw new HttpError(502, '答案之书暂时沉默，稍后再问一次');
    return Response.json({ question: data.question ?? question, answer: data.answer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
};

import type { PagesFunction } from '@cloudflare/workers-types';
import { readJson, cacheControl, errorResponse, HttpError, type Env } from '../../src/server/r2';
const types = ['bilibili', 'weibo', 'toutiao', 'douyin', 'netease-music', 'history', 'weatheralarm'];
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const type = new URL(request.url).searchParams.get('type');
    if (type && !types.includes(type)) throw new HttpError(404, '未知的热榜平台');
    const key = type ? `misc/hotboard/${type}.json` : 'misc/hotboard/index.json';
    return Response.json(await readJson(env, key), { headers: { 'Cache-Control': cacheControl(env) } });
  } catch (error) { return errorResponse(error); }
};
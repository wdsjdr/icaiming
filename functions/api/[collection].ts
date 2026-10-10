import type { PagesFunction } from '@cloudflare/workers-types';
import { readJson, cacheControl, errorResponse, HttpError, type Env } from '../../src/server/r2';
const keys: Record<string, string> = {
  profile: 'site/profile.json', home: 'site/home.json', projects: 'projects/index.json',
  resume: 'resume/resume.json', resources: 'resources/index.json',
  downloads: 'downloads/index.json', rankings: 'rankings/combined.json',
  'epic-free': 'misc/epic-free.json', saying: 'misc/saying.json',
};
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const key = keys[String(params.collection)];
    if (!key) throw new HttpError(404, '接口不存在');
    return Response.json(await readJson(env, key), { headers: { 'Cache-Control': cacheControl(env) } });
  } catch (error) { return errorResponse(error); }
};

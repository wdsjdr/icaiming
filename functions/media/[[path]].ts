import type { PagesFunction } from '@cloudflare/workers-types';
import { cacheControl, errorResponse, HttpError, type Env } from '../../src/server/r2';
export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  try {
    const parts = Array.isArray(params.path) ? params.path : [String(params.path)];
    if (parts.some((part) => !part || part.startsWith('.') || /[\\\x00]/.test(part))) throw new HttpError(404, '资源不存在');
    const key = parts.join('/');
    if (!key.startsWith('assets/') && !key.startsWith('downloads/') && !/^resume\/[\w-]+\.pdf$/.test(key)) throw new HttpError(404, '资源不存在');
    const object = await env.CONTENT_BUCKET.get(key);
    if (!object) throw new HttpError(404, '资源不存在');
    const headers = new Headers({ 'Cache-Control': cacheControl(env), 'X-Content-Type-Options': 'nosniff' });
    object.writeHttpMetadata(headers);
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    const forceDownload = new URL(request.url).searchParams.has('download');
    if (forceDownload || key.startsWith('downloads/')) headers.set('Content-Disposition', `attachment; filename="${key.split('/').pop() ?? 'download'}"`);
    else if (key.endsWith('.pdf')) headers.set('Content-Disposition', 'attachment; filename="IC-Aiming-resume.pdf"');
    return new Response(object.body, { headers });
  } catch (error) { return errorResponse(error); }
};

import { cacheControl, errorResponse, HttpError } from '../../server/r2';
import { decodeParam, type Handler } from '../shared';

export const media: Handler = async (request, env, params) => {
  try {
    const parts = params[0].split('/').map(decodeParam);
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

export const dailyImage: Handler = async (_request, env, params) => {
  try {
    const date = decodeParam(params[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(404, '图片不存在');
    const object = await env.CONTENT_BUCKET.get(`misc/daily-news/${date}.jpg`);
    if (!object) throw new HttpError(404, '图片不存在');
    const headers = new Headers({ 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    object.writeHttpMetadata(headers);
    if (!headers.get('Content-Type')) headers.set('Content-Type', 'image/jpeg');
    return new Response(object.body, { headers });
  } catch (error) { return errorResponse(error); }
};

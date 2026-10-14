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

// Recently captured images may still be corrected by hand (a replace reuses the same URL, so an
// immutable cache would keep serving the old bytes for a year). Only settled dates are immutable.
const IMMUTABLE_AFTER_DAYS = 7;

function beijingDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function daysSince(date: string): number {
  const then = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${beijingDate()}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(today)) return Number.POSITIVE_INFINITY;
  return Math.round((today - then) / 86_400_000);
}

function dailyCacheControl(date: string): string {
  return daysSince(date) >= IMMUTABLE_AFTER_DAYS ? 'public, max-age=31536000, immutable' : 'public, max-age=300, must-revalidate';
}

function weakEtag(tag: string): string {
  return tag.trim().replace(/^W\//i, '');
}

function etagMatches(header: string, etag: string): boolean {
  const target = weakEtag(etag);
  return header.split(',').some((part) => part.trim() === '*' || weakEtag(part) === target);
}

export const dailyImage: Handler = async (request, env, params) => {
  try {
    const date = decodeParam(params[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(404, '图片不存在');
    const object = await env.CONTENT_BUCKET.get(`misc/daily-news/${date}.jpg`);
    if (!object) throw new HttpError(404, '图片不存在');
    const cacheControlValue = dailyCacheControl(date);
    const etag = object.httpEtag;
    const ifNoneMatch = request.headers.get('If-None-Match');
    const ifModifiedSince = request.headers.get('If-Modified-Since');
    const notModified = (ifNoneMatch && etagMatches(ifNoneMatch, etag))
      || (!ifNoneMatch && ifModifiedSince && Date.parse(ifModifiedSince) >= object.uploaded.getTime());
    if (notModified) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControlValue } });
    const headers = new Headers({ 'X-Content-Type-Options': 'nosniff' });
    // writeHttpMetadata copies the object's stored cacheControl; set ours afterwards so it wins.
    object.writeHttpMetadata(headers);
    if (!headers.get('Content-Type')) headers.set('Content-Type', 'image/jpeg');
    headers.set('ETag', etag);
    headers.set('Last-Modified', object.uploaded.toUTCString());
    headers.set('Cache-Control', cacheControlValue);
    return new Response(object.body, { headers });
  } catch (error) { return errorResponse(error); }
};

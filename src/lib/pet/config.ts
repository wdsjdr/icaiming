import { assets, assetPath, type AssetId } from './assets';

export function petConfig(options: { local?: boolean; ui?: boolean; base?: string }) {
  let base = '';
  if (options.local || options.ui) base = '/media/assets/pet/local';
  else if (options.base) {
    const url = new URL(options.base);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
      || !host.includes('.') || host.endsWith('.') || /(^|\.)(localhost|local|internal|r2\.dev)$/.test(host)
      || /^[\d.]+$/.test(host) || host.includes(':') || /[%\\]/.test(options.base)
      || /\/(?:\.|\.\.)(?:\/|$)/.test(options.base)) {
      throw new Error('PUBLIC_PET_ASSET_BASE_URL must be a public HTTPS custom domain + immutable version path (not r2.dev/local).');
    }
    if (url.pathname === '/') throw new Error('Pet asset base requires an explicit immutable version path.');
    base = url.href.replace(/\/$/, '');
  }
  return {
    enabled: Boolean(base),
    urls: base ? Object.fromEntries((Object.keys(assets) as AssetId[]).map((id) => [id, `${base}/${assetPath(id)}`])) : {},
  };
}

import { assets, assetPath, type AssetId } from './assets';

// A new prefix avoids the cached 404s on the unreleased web-1 URLs.
export const petMediaVersion = 'v0.3.7-web-2';
export const petMediaPrefix = `assets/pet/${petMediaVersion}/`;

// Only this audited version/hash/id tuple earns immutable headers.
export function isPetMediaKey(key: string): boolean {
  return (Object.keys(assets) as AssetId[]).some((id) => key === `${petMediaPrefix}${assetPath(id)}`);
}

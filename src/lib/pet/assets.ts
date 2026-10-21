// Immutable, audited subset of dsh-pet 0.3.7. No source paths in client code.
export const assets = {
  idle: { bytes: 441437, sha256: 'deb965d05a85dacf5ff4a20faa757846f0d11679598c3ec578a5571487660395' },
  walk: { bytes: 596902, sha256: '5696b0878be38cc450d6eaace837aef1c1b5834f1382bc6c11c2de582f284673' },
  stretch: { bytes: 396987, sha256: '0ac66d918cc5efd49be1273c3830de73eae5f9bdcd5fcb968d1b2f9b487705ad' },
  yawn: { bytes: 424352, sha256: '2b23372e1ff2bc2f9078c09740708c960d4ea021f9fc3cca294d9df11e393ec8' },
  wave: { bytes: 421669, sha256: '48cd729ccdcf746369942ea954d242e9afdd5643e1dac3827fa5e67450eb8776' },
  sulk: { bytes: 392336, sha256: '6b7176b98408cb649d1d37b6a6222a21aa6b128187e3e0b2d18550d35ab81064' },
  laugh: { bytes: 425393, sha256: 'f228279219f4084323ca1bfef1604f7c77bb3f505d45a8d1747b5ac3f9f2393b' },
} as const;
export type AssetId = keyof typeof assets;
export const autoIds = ['stretch', 'yawn'] as const;
export const clickIds = ['wave', 'sulk', 'laugh'] as const;
export function assetPath(id: AssetId) { return `${assets[id].sha256}/${id}.webm`; }

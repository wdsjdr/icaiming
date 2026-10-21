// Immutable, audited subset of dsh-pet 0.3.7. No source paths in client code.
export const assets = {
  idle: { bytes: 441437, sha256: 'deb965d05a85dacf5ff4a20faa757846f0d11679598c3ec578a5571487660395' },
  walk: { bytes: 596902, sha256: '5696b0878be38cc450d6eaace837aef1c1b5834f1382bc6c11c2de582f284673' },
  stretch: { bytes: 396987, sha256: '0ac66d918cc5efd49be1273c3830de73eae5f9bdcd5fcb968d1b2f9b487705ad' },
  yawn: { bytes: 424352, sha256: '2b23372e1ff2bc2f9078c09740708c960d4ea021f9fc3cca294d9df11e393ec8' },
  wave: { bytes: 421669, sha256: '48cd729ccdcf746369942ea954d242e9afdd5643e1dac3827fa5e67450eb8776' },
  sulk: { bytes: 392336, sha256: '6b7176b98408cb649d1d37b6a6222a21aa6b128187e3e0b2d18550d35ab81064' },
  laugh: { bytes: 425393, sha256: 'f228279219f4084323ca1bfef1604f7c77bb3f505d45a8d1747b5ac3f9f2393b' },
  crouch: { bytes: 215047, sha256: '1c8972478a7f347818165db62b468f1624ec11d0862f38aec3078e3870831d24' },
  startle: { bytes: 282771, sha256: '537dde496e0f776e775dec1bb7bfe3fbc5eebf89112469a1a910ad0433ccde66' },
  tailSweep: { bytes: 352213, sha256: 'e3f92df2cf182fdcb109ad0a865689d66e0a0d10db14c1528e5b3cb2f0bf090d' },
  curtsy: { bytes: 365712, sha256: '6536fb519ba73bbc338d30cf7286b14ffde1278b6d469c64573536dc0f896918' },
  code: { bytes: 383960, sha256: '0441287737cdbb993ce90dfa74c67ea4ea3549d8c8ea98946604668464589ed7' },
  cat: { bytes: 348432, sha256: '068d84e944dfce17de1c5a2ee2a4bc391e2848dad88a7df4877ebf23cf38bcec' },
  bubbles: { bytes: 452096, sha256: 'd64d02059dc1602f7de5aa3135d381351363f021b2bceed47655db322cc71db3' },
  kickShuttle: { bytes: 531015, sha256: '68937b619a44e9ca7ccdfe77e5657f7a9bfa238beb33768378b6f254a16f3dbd' },
} as const;
export type AssetId = keyof typeof assets;
export const autoIds = ['stretch', 'yawn', 'crouch', 'curtsy', 'code', 'cat'] as const;
export const clickIds = ['wave', 'sulk', 'laugh', 'startle', 'tailSweep', 'bubbles', 'kickShuttle'] as const;
export function assetPath(id: AssetId) { return `${assets[id].sha256}/${id}.webm`; }
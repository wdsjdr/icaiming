import { decode as decodeJpeg } from 'jpeg-js';

// 64-bit difference hash (dHash): a 9×8 grayscale thumbnail with one bit per horizontal neighbour.
// It is robust to re-encoding, unlike a byte-for-byte compare (UAPI re-renders the same picture on
// every request, so identical-looking responses rarely share bytes).
export function imageHash(bytes: ArrayBuffer | Uint8Array): string | null {
  try {
    const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const { data, width, height } = decodeJpeg(input, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256, maxResolutionInMP: 40 });
    const gw = 9;
    const gh = 8;
    const gray = new Float64Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / gh));
      for (let x = 0; x < gw; x++) {
        const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / gw));
        const i = (sy * width + sx) * 4;
        gray[y * gw + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
    }
    let bits = '';
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw - 1; x++) bits += gray[y * gw + x] < gray[y * gw + x + 1] ? '1' : '0';
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  } catch {
    return null;
  }
}

export function hashDistance(a: string, b: string): number {
  let distance = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    let diff = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (diff) { distance += diff & 1; diff >>= 1; }
  }
  return distance;
}

import { connect } from 'node:net';

// Node/undici report a failed connection with the OS or undici code on the error's `cause`.
const connectionCodes = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT',
  'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);

export function connectionErrorCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | undefined)?.cause;
  return typeof cause?.code === 'string' ? cause.code : '';
}

// A failed connection (not an HTTP status) is worth retrying through the other outbound path.
export function isConnectionError(error: unknown): boolean {
  return connectionCodes.has(connectionErrorCode(error));
}

export interface Endpoint { host: string; port: number }

export function proxyEndpoint(proxyUrl: string): Endpoint {
  const url = new URL(proxyUrl);
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  return { host: url.hostname, port };
}

// Resolves true only when a TCP connection to host:port succeeds before the timeout.
export function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

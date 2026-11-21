export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) { super(message); this.name = 'ApiError'; }
}
export type ResponseWithMeta<T> = { data: T; status: number; headers: Headers; etag: string | null };
/** Token stays in memory; the session itself is an HttpOnly cookie. */
export function createTransport(baseUrl: string, send: typeof fetch = fetch) {
  let csrfToken: string | null = null;
  async function requestWithMeta<T>(path: string, init: RequestInit = {}): Promise<ResponseWithMeta<T>> {
    const headers = new Headers(init.headers);
    if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD', 'OPTIONS'].includes((init.method ?? 'GET').toUpperCase()) && csrfToken && !headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', csrfToken);
    let res: Response;
    try { res = await send(`${baseUrl.replace(/\/$/, '')}${path}`, { ...init, headers, credentials: 'include' }); }
    catch { throw new ApiError(0, 'NETWORK_ERROR', 'API 서버에 연결할 수 없습니다. mock 서버 실행 상태를 확인해 주세요.'); }
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { code?: string; message?: string; requestId?: string };
      throw new ApiError(res.status, data.code ?? 'HTTP_ERROR', data.message ?? `요청에 실패했습니다 (${res.status}).`, data.requestId);
    }
    const data = res.status === 204 ? undefined as T : await res.json() as T;
    return { data, status: res.status, headers: res.headers, etag: res.headers.get('ETag') };
  }
  return {
    setCsrfToken(value: string | null) { csrfToken = value; },
    requestWithMeta,
    async request<T>(path: string, init: RequestInit = {}): Promise<T> { return (await requestWithMeta<T>(path, init)).data; },
  };
}

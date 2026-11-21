import { config } from '../config';

/** 서버 호출 공통 함수. 화면·부품 코드에서는 fetch를 직접 쓰지 않고 api/ 함수만 부른다 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...init,
  });
  if (!res.ok) throw new Error(`요청 실패 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

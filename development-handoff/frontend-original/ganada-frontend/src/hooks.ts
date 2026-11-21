import { useEffect, useState } from 'react';

/** api 함수를 불러서 { data, error } 로 돌려준다 */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((d) => alive && setData(d)).catch((e) => alive && setError(e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

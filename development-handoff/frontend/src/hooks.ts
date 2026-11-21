import { useEffect, useState } from 'react';
/** Cancelled requests cannot overwrite a later class/session's state. */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    load().then((d) => { if (alive) setData(d); }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e : new Error('불러오지 못했습니다.')); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision]);
  return { data, error, retry: () => setRevision((v) => v + 1) };
}

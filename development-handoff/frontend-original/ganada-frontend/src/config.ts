/** 환경 값은 여기에서만 읽는다(.env 참고). 코드에 주소를 직접 쓰지 않는다. */
export const config = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? '',
  USE_MOCK: (import.meta.env.VITE_USE_MOCK ?? 'true') === 'true',
};

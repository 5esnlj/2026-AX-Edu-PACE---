/** Browser calls the same-origin Vite proxy; no API key belongs in a VITE_ value. */
export const config = { API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1' };

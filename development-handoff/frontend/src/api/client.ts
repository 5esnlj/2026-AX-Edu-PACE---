import { config } from '../config';
import { createTransport } from './transport';
export { ApiError } from './transport';
const transport = createTransport(config.API_BASE_URL);
export const request = transport.request;
export const setCsrfToken = transport.setCsrfToken;
export const requestWithMeta = transport.requestWithMeta;

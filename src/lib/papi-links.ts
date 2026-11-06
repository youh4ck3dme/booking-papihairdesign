import { resolvePapiWebsiteUrl } from './public-integration-config';

// Preview builds supply an explicit paired Angular URL; production has a stable default.
export const PAPI_WEBSITE_URL = resolvePapiWebsiteUrl(import.meta.env.VITE_PAPI_WEBSITE_URL);

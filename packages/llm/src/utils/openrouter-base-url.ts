/** Global OpenRouter endpoint. Used when no base URL is configured. */
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** EU in-region OpenRouter endpoint (OpenRouter Business, fails closed, EU endpoints only). */
export const EU_OPENROUTER_BASE_URL = 'https://eu.openrouter.ai/api/v1';

/** Environment variable read when no explicit `baseUrl` is given. */
export const OPENROUTER_BASE_URL_ENV = 'OPENROUTER_BASE_URL';

const REQUIRED_PATH = '/api/v1';
const ROOT_HOST = 'openrouter.ai';

/** Hides userinfo (`user:pass@`) so a credential never reaches an error message. */
function redact(raw: string): string {
  return raw.replace(/\/\/[^/?#]*@/, '//***@');
}

function reject(raw: string, source: string, reason: string): never {
  throw new Error(`Invalid OpenRouter base URL ${JSON.stringify(redact(raw))} (from ${source}): ${reason}`);
}

function validate(raw: string, source: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') reject(raw, source, 'the value is empty');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return reject(raw, source, 'it is not a valid URL');
  }

  if (url.protocol !== 'https:') reject(raw, source, 'the protocol must be https');
  if (url.hostname !== ROOT_HOST && !url.hostname.endsWith(`.${ROOT_HOST}`)) {
    reject(raw, source, `the host must be ${ROOT_HOST} or a subdomain of it`);
  }
  if (url.username !== '' || url.password !== '') reject(raw, source, 'credentials in the URL are not allowed');
  if (url.port !== '') reject(raw, source, 'a port is not allowed');
  if (url.pathname !== REQUIRED_PATH && url.pathname !== `${REQUIRED_PATH}/`) {
    reject(raw, source, `the path must be ${REQUIRED_PATH}`);
  }
  if (url.search !== '' || url.hash !== '') reject(raw, source, 'a query or fragment is not allowed');

  // Catch-all: the parser normalises away a default port (:443), an empty "?" or "#" and other
  // oddities. The only accepted input is the canonical form, with at most one trailing slash.
  const canonical = `https://${url.hostname}${REQUIRED_PATH}`;
  const withoutSlash = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  if (withoutSlash.toLowerCase() !== canonical) {
    reject(raw, source, `the value must be exactly ${canonical}`);
  }
  return canonical;
}

/**
 * Resolves and validates the OpenRouter base URL. Fails closed.
 *
 * Order: the explicit value, then `OPENROUTER_BASE_URL`, then the global default. An empty string
 * counts as a value and is rejected, so a blank setting cannot silently fall back to the global host.
 *
 * Accepted: `https://openrouter.ai/api/v1` and `https://<sub>.openrouter.ai/api/v1`, with an optional
 * trailing slash (stripped). Anything else throws, and the message names the offending value but
 * never an API key.
 *
 * Apps can call this at boot to check their configuration.
 */
export function resolveOpenRouterBaseUrl(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (explicit !== undefined) return validate(explicit, 'the baseUrl option');
  const fromEnv = env[OPENROUTER_BASE_URL_ENV];
  if (fromEnv !== undefined) return validate(fromEnv, `the ${OPENROUTER_BASE_URL_ENV} environment variable`);
  return DEFAULT_OPENROUTER_BASE_URL;
}

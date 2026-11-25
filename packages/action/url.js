export const DEFAULT_TOKEN_BUREAU_URL =
  'https://token-bureau.env-01m897qt5zwxskrn8f869qdqsh.dev.atlas-prod.public-cloud.social.gouv.fr';

const RETIRED_HOSTS = ['token-bureau.fabrique.social.gouv.fr'];

export function resolveTokenBureauUrl(input) {
  const value = (input || '').trim();
  if (!value) {
    return { url: DEFAULT_TOKEN_BUREAU_URL, warning: null };
  }

  let hostname;
  try {
    hostname = new URL(value).hostname;
  } catch {
    throw new Error(`Invalid token-bureau-url: ${value}`);
  }

  if (RETIRED_HOSTS.includes(hostname)) {
    return {
      url: DEFAULT_TOKEN_BUREAU_URL,
      warning: `token-bureau-url ${value} is retired, using ${DEFAULT_TOKEN_BUREAU_URL} instead. Drop the token-bureau-url input to use the default.`
    };
  }

  return { url: value, warning: null };
}

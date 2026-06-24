/**
 * User-Agent crawler detection for Google's crawler family.
 *
 * @packageDocumentation
 */

/**
 * All Google crawler tokens whose presence in a UA string constitutes a
 * verifiable claim. Ordered from most-specific to least-specific so the
 * detection loop returns the best match.
 */
export const GOOGLE_CRAWLER_TOKENS = [
  'AdsBot-Google-Mobile',
  'AdsBot-Google',
  'Googlebot-Image',
  'Googlebot-News',
  'Googlebot-Video',
  'Googlebot-Mobile',
  'Google-InspectionTool',
  'Storebot-Google',
  'Google-Read-Aloud',
  'Google-Site-Verification',
  'FeedFetcher-Google',
  'Mediapartners-Google',
  'GoogleOther',
  'APIs-Google',
  'Googlebot',
] as const;

export type GoogleCrawlerToken = (typeof GOOGLE_CRAWLER_TOKENS)[number];

/**
 * Detects whether a User-Agent string claims to be a Google crawler.
 *
 * Uses word-boundary matching (not a loose substring) to avoid false positives
 * from UAs that merely contain the word "google" incidentally (e.g. a normal
 * Chrome browser whose referrer is embedded in the UA).
 *
 * Returns the most specific matched token (e.g. `'Googlebot-Image'` rather
 * than `'Googlebot'`), or `null` if no Google crawler token is present.
 *
 * @param userAgent - The raw User-Agent header value
 * @returns The matched crawler token or `null`
 *
 * @example
 * ```typescript
 * detectClaimedCrawler('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
 * // => 'Googlebot'
 *
 * detectClaimedCrawler('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ...')
 * // => null
 * ```
 */
export function detectClaimedCrawler(userAgent: string): GoogleCrawlerToken | null {
  if (!userAgent) {
    return null;
  }

  for (const token of GOOGLE_CRAWLER_TOKENS) {
    // Match the token at a word boundary: preceded by start-of-string,
    // a space, or a slash; followed by end-of-string, a space, slash, or
    // semicolon. This prevents partial matches inside longer words.
    const pattern = new RegExp(`(?:^|[\\s/;,])${escapeRegExp(token)}(?:$|[\\s/;,(])`, 'i');
    if (pattern.test(userAgent)) {
      return token;
    }
  }

  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

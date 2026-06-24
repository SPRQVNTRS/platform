import { describe, it, expect } from 'vitest';
import { detectClaimedCrawler, GOOGLE_CRAWLER_TOKENS } from '../ua.js';

describe('detectClaimedCrawler', () => {
  describe('Googlebot desktop', () => {
    it('detects standard Googlebot UA', () => {
      const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
      expect(detectClaimedCrawler(ua)).toBe('Googlebot');
    });

    it('detects Googlebot with extra context', () => {
      const ua = 'Googlebot/2.1 (+http://www.google.com/bot.html)';
      expect(detectClaimedCrawler(ua)).toBe('Googlebot');
    });
  });

  describe('Googlebot mobile', () => {
    it('detects Googlebot-Mobile token', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot-Mobile/2.1; +http://www.google.com/bot.html)';
      expect(detectClaimedCrawler(ua)).toBe('Googlebot-Mobile');
    });
  });

  describe('Googlebot-Image', () => {
    it('returns Googlebot-Image (more specific than Googlebot)', () => {
      const ua = 'Googlebot-Image/1.0';
      expect(detectClaimedCrawler(ua)).toBe('Googlebot-Image');
    });
  });

  describe('AdsBot-Google', () => {
    it('detects AdsBot-Google desktop UA', () => {
      const ua = 'AdsBot-Google (+http://www.google.com/adsbot.html)';
      expect(detectClaimedCrawler(ua)).toBe('AdsBot-Google');
    });

    it('detects AdsBot-Google-Mobile (more specific)', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AdsBot-Google-Mobile/1.0';
      expect(detectClaimedCrawler(ua)).toBe('AdsBot-Google-Mobile');
    });
  });

  describe('Google-InspectionTool', () => {
    it('detects Google-InspectionTool', () => {
      const ua = 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0; +https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)';
      expect(detectClaimedCrawler(ua)).toBe('Google-InspectionTool');
    });
  });

  describe('Mediapartners-Google', () => {
    it('detects Mediapartners-Google', () => {
      const ua = 'Mediapartners-Google';
      expect(detectClaimedCrawler(ua)).toBe('Mediapartners-Google');
    });
  });

  describe('GoogleOther', () => {
    it('detects GoogleOther', () => {
      const ua = 'GoogleOther';
      expect(detectClaimedCrawler(ua)).toBe('GoogleOther');
    });
  });

  describe('non-Google browsers → null', () => {
    it('returns null for Chrome desktop UA', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      expect(detectClaimedCrawler(ua)).toBeNull();
    });

    it('returns null for Safari UA', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      expect(detectClaimedCrawler(ua)).toBeNull();
    });

    it('returns null for Firefox UA', () => {
      const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
      expect(detectClaimedCrawler(ua)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectClaimedCrawler('')).toBeNull();
    });

    it('returns null for a UA that merely mentions google.com', () => {
      const ua = 'Mozilla/5.0 (compatible; MyCrawler/1.0; see http://www.google.com/)';
      expect(detectClaimedCrawler(ua)).toBeNull();
    });
  });

  describe('GOOGLE_CRAWLER_TOKENS export', () => {
    it('is a non-empty readonly array', () => {
      expect(GOOGLE_CRAWLER_TOKENS.length).toBeGreaterThan(0);
    });

    it('contains Googlebot', () => {
      expect(GOOGLE_CRAWLER_TOKENS).toContain('Googlebot');
    });

    it('contains AdsBot-Google-Mobile before AdsBot-Google', () => {
      const mobileIdx = GOOGLE_CRAWLER_TOKENS.indexOf('AdsBot-Google-Mobile');
      const desktopIdx = GOOGLE_CRAWLER_TOKENS.indexOf('AdsBot-Google');
      expect(mobileIdx).toBeLessThan(desktopIdx);
    });
  });
});

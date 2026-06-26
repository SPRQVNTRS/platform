import { describe, it, expect } from 'vitest';
import { formatNumber, formatDecimal, formatInteger, formatSmart } from './number';

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

describe('formatNumber', () => {
  describe('decimal separator localisation', () => {
    it('formats 3.6 with de locale using comma decimal', () => {
      expect(formatNumber(3.6, 'de', { maximumFractionDigits: 1 })).toBe('3,6');
    });

    it('formats 3.6 with en locale using period decimal', () => {
      expect(formatNumber(3.6, 'en', { maximumFractionDigits: 1 })).toBe('3.6');
    });

    it('accepts a full BCP-47 tag (de-DE) in place of a short code', () => {
      expect(formatNumber(3.6, 'de-DE', { maximumFractionDigits: 1 })).toBe('3,6');
    });
  });

  describe('collapse behaviour with maximumFractionDigits: 1', () => {
    it('rounds 0.001 to "0" for de locale', () => {
      expect(formatNumber(0.001, 'de', { maximumFractionDigits: 1 })).toBe('0');
    });

    it('rounds 0.001 to "0" for en locale', () => {
      expect(formatNumber(0.001, 'en', { maximumFractionDigits: 1 })).toBe('0');
    });
  });

  describe('integers are unchanged', () => {
    it('formats 100 with de locale and maximumFractionDigits: 1', () => {
      expect(formatNumber(100, 'de', { maximumFractionDigits: 1 })).toBe('100');
    });

    it('formats 49 with en locale and maximumFractionDigits: 1', () => {
      expect(formatNumber(49, 'en', { maximumFractionDigits: 1 })).toBe('49');
    });
  });

  describe('grouping separators', () => {
    it('uses period as thousands separator for de locale', () => {
      expect(formatNumber(1234.56, 'de')).toBe('1.234,56');
    });

    it('uses comma as thousands separator for en locale', () => {
      expect(formatNumber(1234.56, 'en')).toBe('1,234.56');
    });

    it('uses space (possibly narrow no-break) as thousands separator for fr locale', () => {
      // Node ICU may emit U+202F (narrow no-break space) — normalise all whitespace
      const result = formatNumber(1234.5, 'fr', { maximumFractionDigits: 1 }).replace(/\s/g, ' ');
      expect(result).toMatch(/1 ?234,5/);
    });
  });

  describe('zero', () => {
    it('formats 0 as "0" for de', () => {
      expect(formatNumber(0, 'de')).toBe('0');
    });

    it('formats 0 as "0" for en', () => {
      expect(formatNumber(0, 'en')).toBe('0');
    });

    it('formats 0 as "0" for fr', () => {
      expect(formatNumber(0, 'fr')).toBe('0');
    });
  });
});

// ---------------------------------------------------------------------------
// formatDecimal
// ---------------------------------------------------------------------------

describe('formatDecimal', () => {
  it('formats 5 with 1 decimal place for de locale', () => {
    expect(formatDecimal(5, 'de', 1)).toBe('5,0');
  });

  it('formats 5 with 1 decimal place for en locale', () => {
    expect(formatDecimal(5, 'en', 1)).toBe('5.0');
  });

  it('defaults to 1 decimal place when decimals is omitted', () => {
    expect(formatDecimal(5, 'en')).toBe('5.0');
  });

  it('preserves trailing zeros to fill fixed precision', () => {
    expect(formatDecimal(3, 'en', 2)).toBe('3.00');
  });
});

// ---------------------------------------------------------------------------
// formatInteger
// ---------------------------------------------------------------------------

describe('formatInteger', () => {
  it('rounds 52.7 to 53 for de locale', () => {
    expect(formatInteger(52.7, 'de')).toBe('53');
  });

  it('adds period thousands separator for de locale on 1300', () => {
    expect(formatInteger(1300, 'de')).toBe('1.300');
  });

  it('adds comma thousands separator for en locale on 1300', () => {
    expect(formatInteger(1300, 'en')).toBe('1,300');
  });
});

// ---------------------------------------------------------------------------
// formatSmart
// ---------------------------------------------------------------------------

describe('formatSmart', () => {
  it('formats values >= 100 as an integer (0 decimal places)', () => {
    expect(formatSmart(250, 'en')).toBe('250');
  });

  it('formats values >= 10 with 1 decimal place', () => {
    expect(formatSmart(42.37, 'en')).toBe('42.4');
  });

  it('formats values >= 1 with 2 decimal places', () => {
    expect(formatSmart(4.378, 'en')).toBe('4.38');
  });

  it('formats values >= 0.01 with 3 decimal places', () => {
    expect(formatSmart(0.045, 'en')).toBe('0.045');
  });

  it('formats values < 0.01 with 4 decimal places', () => {
    expect(formatSmart(0.0012, 'en')).toBe('0.0012');
  });

  it('formats 0 with 4 decimal places for de (0 < 0.01 threshold)', () => {
    expect(formatSmart(0, 'de')).toBe('0,0000');
  });

  it('formats 0 with 4 decimal places for en (0 < 0.01 threshold)', () => {
    expect(formatSmart(0, 'en')).toBe('0.0000');
  });
});

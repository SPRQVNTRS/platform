/**
 * String manipulation helper functions
 */

const slugifyCharMap: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  ü: 'u',
  ß: 'ss',
  Ä: 'A',
  Ö: 'O',
  Ü: 'U',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  ç: 'c',
  à: 'a',
  â: 'a',
  ô: 'o',
  ù: 'u',
  û: 'u',
  î: 'i',
  ï: 'i',
  É: 'E',
  È: 'E',
  Ê: 'E',
  Ë: 'E',
  Ç: 'C',
  À: 'A',
  Â: 'A',
  Ô: 'O',
  Ù: 'U',
  Û: 'U',
  Î: 'I',
  Ï: 'I',
};

/**
 * Converts a string to a URL-friendly slug.
 *
 * Handles special characters, diacritics, and European characters by
 * normalizing them to ASCII equivalents.
 *
 * @param text - The string to slugify
 * @returns A lowercase, hyphenated slug safe for URLs
 *
 * @example
 * ```typescript
 * slugify('Hello World!');
 * // => 'hello-world'
 *
 * slugify('Café München');
 * // => 'cafe-munchen'
 *
 * slugify('Products / Services');
 * // => 'products-services'
 * ```
 */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9\s]/g, (ch) => slugifyCharMap[ch] || ch)
      .toLowerCase()
      .replace(/[\s.]+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/[-]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
  );
}

const europeanCharMap: Record<string, string> = {
  // Lowercase letters
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  ä: 'ae',
  å: 'a',
  ā: 'a',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ē: 'e',
  ì: 'i',
  í: 'i',
  î: 'i',
  ï: 'i',
  ī: 'i',
  ı: 'i',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'oe',
  ō: 'o',
  ù: 'u',
  ú: 'u',
  û: 'u',
  ü: 'ue',
  ū: 'u',
  ý: 'y',
  ÿ: 'y',
  ñ: 'n',
  ń: 'n',
  ß: 'ss',
  ç: 'c',
  ş: 's',
  š: 's',
  ś: 's',

  // Uppercase letters
  À: 'A',
  Á: 'A',
  Â: 'A',
  Ã: 'A',
  Ä: 'AE',
  Å: 'A',
  Ā: 'A',
  È: 'E',
  É: 'E',
  Ê: 'E',
  Ë: 'E',
  Ē: 'E',
  Ì: 'I',
  Í: 'I',
  Î: 'I',
  Ï: 'I',
  Ī: 'I',
  İ: 'I',
  Ò: 'O',
  Ó: 'O',
  Ô: 'O',
  Õ: 'O',
  Ö: 'OE',
  Ō: 'O',
  Ù: 'U',
  Ú: 'U',
  Û: 'U',
  Ü: 'UE',
  Ū: 'U',
  Ý: 'Y',
  Ñ: 'N',
  Ń: 'N',
  Ç: 'C',
  Ş: 'S',
  Š: 'S',
  Ś: 'S',
};

/**
 * Normalizes European characters to their ASCII equivalents.
 *
 * Unlike `slugify`, this preserves the original casing and spacing,
 * only replacing accented/special characters with their closest ASCII representation.
 * German umlauts are expanded (ä → ae, ö → oe, ü → ue).
 *
 * @param text - The string containing European characters
 * @returns The string with European characters replaced by ASCII equivalents
 *
 * @example
 * ```typescript
 * normalizeEuropeanChars('Müller');
 * // => 'Mueller'
 *
 * normalizeEuropeanChars('François Château');
 * // => 'Francois Chateau'
 *
 * normalizeEuropeanChars('Straße');
 * // => 'Strasse'
 * ```
 */
export function normalizeEuropeanChars(text: string): string {
  return text.replace(/[^\u0000-\u007F]/g, (char) => europeanCharMap[char] || char);
}

/**
 * Generates a random alphanumeric string of the specified length.
 *
 * Uses uppercase letters, lowercase letters, and digits (A-Z, a-z, 0-9).
 * Note: This is not cryptographically secure; use `crypto.randomBytes`
 * for security-sensitive applications.
 *
 * @param length - The desired length of the random string
 * @returns A random alphanumeric string
 *
 * @example
 * ```typescript
 * generateRandomString(8);
 * // => 'xK9mPq2L' (example output)
 *
 * generateRandomString(16);
 * // => 'aBcDeFgH12345678' (example output)
 * ```
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

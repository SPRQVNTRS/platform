export type SanitizationResult = {
  /** The sanitized text with artifacts removed */
  sanitized: string;
  /** Whether any artifacts were removed */
  wasModified: boolean;
  /** Human-readable descriptions of what was removed */
  removedPatterns: string[];
};

/**
 * Strips JSON-style and structural artifacts from prose text produced by LLMs.
 *
 * Each pattern is applied independently. The function is pure (no I/O, no side effects).
 * Surrounding prose is never removed — only the artifact token/sequence itself.
 *
 * Patterns handled:
 *   1. Markdown code fences (``` or ~~~) leaked into plain text
 *   2. XML-like closing tags (</article>, </content>, </output>) from prompt scaffolding
 *   3. PMID-style bracketed numeric placeholders ([PMID:12345], [14094+])
 *   4. Structural/editorial ALL_CAPS labels at line start (PARAGRAPH_1:, SECTION_2:)
 *   5. INVALID_* token blocks (model generation corruption)
 *   6. Stray JSON structural delimiters (sequences of 2+ of {}[], or orphaned "]} etc.)
 *   7. Meta-commentary/apology fragments (I apologize for…, As an AI…)
 *   8. (Blank-line normalization runs after all patterns)
 *
 * @param text - The raw text from LLM output
 * @returns SanitizationResult with the cleaned text and metadata
 */
export function stripJsonArtifacts(text: string): SanitizationResult {
  const removedPatterns: string[] = [];
  let result = text;

  // Pattern 1: Markdown code fences (``` or ~~~) leaked into prose
  // Must run first — they often wrap JSON blocks
  const codeFencesBefore = result;
  result = result.replace(/^```[\w]*\n?/gm, '').replace(/^```\s*$/gm, '').replace(/^~~~[\w]*\n?/gm, '').replace(/^~~~\s*$/gm, '');
  if (result !== codeFencesBefore) {
    removedPatterns.push('markdown code fences');
  }

  // Pattern 2: XML-like closing tags leaked from prompt scaffolding
  // e.g. </article>, </output>, </content>, </task>
  const xmlTagsBefore = result;
  result = result.replace(/<\/[a-zA-Z_][a-zA-Z0-9_-]*>/g, '');
  if (result !== xmlTagsBefore) {
    removedPatterns.push('XML-like closing tags');
  }

  // Pattern 3: PMID-style bracketed numeric placeholders
  // [PMID:12345] or [12345] where number is 5+ digits — document IDs, not years/scores
  const pmidBefore = result;
  result = result.replace(/\[PMID:\d+\]/gi, '');
  result = result.replace(/\[\d{5,}\]/g, '');
  if (result !== pmidBefore) {
    removedPatterns.push('PMID-style numeric placeholders');
  }

  // Pattern 4: Structural/editorial label at line start
  // e.g. "PARAGRAPH_1:", "SECTION_2:", "PART_1:", "INTRO:", "CONCLUSION:"
  const labelsBefore = result;
  result = result.replace(/^[A-Z][A-Z0-9_]{2,}:\s*/gm, '');
  if (result !== labelsBefore) {
    removedPatterns.push('structural/editorial ALL_CAPS labels');
  }

  // Pattern 5: INVALID_* token blocks (model generation corruption)
  const invalidTokensBefore = result;
  result = result.replace(/\bINVALID_[A-Z_]+\b/g, '');
  if (result !== invalidTokensBefore) {
    removedPatterns.push('INVALID_* token blocks');
  }

  // Pattern 6: Stray JSON structural delimiters
  const jsonDelimitersBefore = result;
  result = result.replace(/["\]}\[{]{2,}/g, '');
  result = result.replace(/"[\]},]+/g, '');
  if (result !== jsonDelimitersBefore) {
    removedPatterns.push('JSON structural delimiters');
  }

  // Pattern 7: Meta-commentary / apology fragments
  const metaBefore = result;
  result = result.replace(/(?:^|\n)(I apologize for[^.!?]*[.!?])/gi, '');
  result = result.replace(/(?:^|\n)(I'm sorry,? but[^.!?]*[.!?])/gi, '');
  result = result.replace(/(?:^|\n)(As an AI[^.!?]*[.!?])/gi, '');
  if (result !== metaBefore) {
    removedPatterns.push('meta-commentary/apology fragments');
  }

  // Normalise blank-line runs that artifact removal might have created
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return {
    sanitized: result,
    wasModified: removedPatterns.length > 0,
    removedPatterns,
  };
}

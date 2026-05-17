/**
 * Regression tests for the JSON-artifact sanitizer.
 *
 * Test matrix maps directly to the 5 prod failure patterns (creations 14094–14181, May 2026)
 * plus positive/negative controls.
 *
 * These tests are PURE — they exercise `stripJsonArtifacts` (the sanitizer function) which
 * is the deterministic core of the post-process step. No LLM call, no DB, no S3.
 */

import { describe, it, expect } from 'vitest';
import { stripJsonArtifacts } from '../src/utils/strip-json-artifacts';

// ── helpers ──────────────────────────────────────────────────────────────────

function assertClean(input: string): void {
  const result = stripJsonArtifacts(input);
  expect(result.wasModified).toBe(false);
  expect(result.removedPatterns).toHaveLength(0);
  expect(result.sanitized).toBe(input.trim());
}

function assertFlagged(input: string, expectedPatternSubstring: string): void {
  const result = stripJsonArtifacts(input);
  expect(result.wasModified).toBe(true);
  const matched = result.removedPatterns.some((p) =>
    p.toLowerCase().includes(expectedPatternSubstring.toLowerCase()),
  );
  expect(matched, `Expected a removed-pattern entry containing "${expectedPatternSubstring}", got: ${JSON.stringify(result.removedPatterns)}`).toBe(true);
}

// ── (a) Clean prose → passes with no modifications ───────────────────────────

describe('formatting-errors-check — clean prose', () => {
  it('does not modify a well-formed English paragraph', () => {
    const prose =
      'Marseille arrive at this Ligue 1 clash on the back of three consecutive wins, ' +
      'with striker Alexis Sánchez in exceptional form. Rennes, meanwhile, have won only ' +
      'once in their last five away fixtures and will need to tighten their defensive shape.';
    assertClean(prose);
  });

  it('does not modify French prose', () => {
    const prose =
      "L'Inter Milan aborde ce choc de Série A avec une avance confortable de huit points. " +
      "Hélàs Vérone, malgré un bilan médiocre à l'extérieur, a surpris la Juventus il y a quinze jours.";
    assertClean(prose);
  });

  it('does not modify prose with match scores in various formats', () => {
    const prose = 'A 2:1 win over Lyon in the last round gave them confidence. The 3-0 defeat to Brest in Round 28 still stings.';
    assertClean(prose);
  });
});

// ── (b) 14094 pattern — JSON/list fragment, stray quotes/brackets/braces ─────

describe('formatting-errors-check — creation 14094 (JSON/list fragment)', () => {
  it('strips stray JSON bracket/brace sequences from prose', () => {
    const contaminated =
      'Marseille ont enchaîné trois victoires consécutives. []} La défense reste solide. ' +
      '{[ Rennes ne gagne pas souvent en déplacement.';
    assertFlagged(contaminated, 'json structural');
  });

  it('strips JSON delimiter sequences that appear mid-sentence', () => {
    const contaminated = 'The team showed real quality "]} in their recent form.';
    assertFlagged(contaminated, 'json structural');
  });

  it('strips INVALID_* token blocks embedded in prose', () => {
    const contaminated =
      'Rennes showed INVALID_TOKEN INVALID_DATA resilience in the second half.';
    assertFlagged(contaminated, 'INVALID_*');
  });
});

// ── (c) 14148 pattern — corrupted serialization / markup-like artifact ────────

describe('formatting-errors-check — creation 14148 (corrupted serialization)', () => {
  it('strips markup-like closing tags that leaked from prompt scaffolding', () => {
    const contaminated =
      "L'Inter Milan domine la Serie A.</article> La défense de Vérone est vulnérable.";
    assertFlagged(contaminated, 'XML-like closing tags');
  });

  it('strips sequences like "qarp" surrounded by JSON delimiters', () => {
    // The "qarp" is corrupted text but the surrounding "}>{" is the structural artifact
    const contaminated = 'Inter have scored in every home game this season "]}qarp">}{ since September.';
    assertFlagged(contaminated, 'json structural');
  });

  it('strips multiple closing tags in sequence', () => {
    const contaminated = 'The match kicks off at 20:45.</output></task> Tickets are sold out.';
    assertFlagged(contaminated, 'XML-like closing tags');
  });
});

// ── (d) 14158 pattern — PMID placeholder ──────────────────────────────────────

describe('formatting-errors-check — creation 14158 (PMID placeholder)', () => {
  it('strips PMID-style bracket placeholders', () => {
    const contaminated = 'The squad analysis [PMID:14158] reveals a key weakness at right-back.';
    assertFlagged(contaminated, 'pmid');
  });

  it('strips bare 5-digit numeric bracket placeholders', () => {
    const contaminated = 'Form data [14158] indicates Rennes have not won away in six matches.';
    assertFlagged(contaminated, 'pmid');
  });

  it('strips markdown code fences that leaked from generation control', () => {
    const contaminated =
      '```json\n{"section": "intro"}\n```\nMarseille sont en pleine forme.';
    assertFlagged(contaminated, 'code fences');
  });

  it('strips meta-instructions embedded in prose', () => {
    const contaminated =
      'I apologize for the confusion in the previous output. Marseille have shown great form.';
    assertFlagged(contaminated, 'meta-commentary');
  });
});

// ── (e) 14181 pattern — JSON-style delimiters and quoting ────────────────────

describe('formatting-errors-check — creation 14181 (JSON-style delimiters)', () => {
  it('strips JSON-style delimiter sequences that bookend prose fragments', () => {
    const contaminated = '"paragraphs": ["Marseille enter this clash in top form."]}}';
    assertFlagged(contaminated, 'json structural');
  });

  it('strips orphaned closing braces and brackets after prose', () => {
    const contaminated =
      'Rennes travel to Marseille with little confidence after five away defeats. ]}}\n' +
      'Their defensive record has been poor.';
    assertFlagged(contaminated, 'json structural');
  });
});

// ── (f) 14166 pattern — structural/editorial label at start ──────────────────

describe('formatting-errors-check — creation 14166 (structural/editorial label)', () => {
  it('strips ALL_CAPS structural label at start of paragraph', () => {
    const contaminated =
      'INTRO: Marseille ont montré une grande solidité défensive lors de leurs trois derniers matches.';
    assertFlagged(contaminated, 'structural');
  });

  it('strips PARAGRAPH_N: label at start of a line', () => {
    const contaminated =
      'PARAGRAPH_1: The home side enters this match as heavy favourites.\n' +
      'Their recent form has been exceptional.';
    assertFlagged(contaminated, 'structural');
  });

  it('strips SECTION_N: label at start of a line', () => {
    const contaminated = 'SECTION_2: Die Auswärtsform von Rennes ist enttäuschend.';
    assertFlagged(contaminated, 'structural');
  });
});

// ── (g) Negative control — integer resembling PMID should NOT be flagged ──────

describe('formatting-errors-check — negative controls', () => {
  it('does NOT strip a 4-digit year in prose (e.g. 2018)', () => {
    const prose = 'The club was founded in 2018, with 1234 attempts on goal that season.';
    assertClean(prose);
  });

  it('does NOT strip a 4-digit integer in brackets (e.g. [1234])', () => {
    // 4-digit numbers in brackets should be preserved (could be a score, year, or list reference)
    const prose = 'The analysis covers matches from round [1234] onwards.';
    assertClean(prose);
  });

  it('does NOT strip legitimate odds in numeric format (e.g. 2.5)', () => {
    const prose = 'Marseille are priced at 2.5 to win, with Rennes at 2.8 for the away victory.';
    assertClean(prose);
  });

  it('does NOT strip a single bracket that is part of an instructional list step', () => {
    const prose = '1. Registrieren Sie sich bei bet365. 2. Einzahlung vornehmen. 3. Bonus aktivieren.';
    assertClean(prose);
  });

  it('preserves text when no artifacts present at all', () => {
    const prose = 'Inter Milan clinch the Serie A title with a 3:0 win over Hellas Verona.';
    const result = stripJsonArtifacts(prose);
    expect(result.wasModified).toBe(false);
    expect(result.sanitized).toBe(prose);
  });
});

// ── Golden input/output pairs for sanitization step ─────────────────────────

describe('formatting-errors-check — golden input/output pairs', () => {
  it('removes PMID placeholder and leaves surrounding prose unchanged', () => {
    const input = 'Form data [PMID:14158] indicates Rennes have not won away in six matches.';
    const expected = 'Form data  indicates Rennes have not won away in six matches.';
    const result = stripJsonArtifacts(input);
    expect(result.sanitized).toBe(expected.trim());
    expect(result.wasModified).toBe(true);
  });

  it('removes XML closing tag and leaves surrounding prose unchanged', () => {
    const input = "L'Inter Milan domine la Serie A.</article> La défense de Vérone est vulnérable.";
    const result = stripJsonArtifacts(input);
    expect(result.sanitized).toBe("L'Inter Milan domine la Serie A. La défense de Vérone est vulnérable.");
    expect(result.wasModified).toBe(true);
  });

  it('removes structural label prefix and leaves prose content intact', () => {
    const input = 'INTRO: Marseille ont montré une grande solidité défensive.';
    const result = stripJsonArtifacts(input);
    expect(result.sanitized).toBe('Marseille ont montré une grande solidité défensive.');
    expect(result.wasModified).toBe(true);
  });

  it('removes markdown code fence wrapper and leaves body prose intact', () => {
    const input = '```\nMarseille sont en pleine forme.\n```';
    const result = stripJsonArtifacts(input);
    expect(result.sanitized).toContain('Marseille sont en pleine forme.');
    expect(result.wasModified).toBe(true);
  });

  it('removes INVALID_* tokens and leaves surrounding prose intact', () => {
    const input = 'Rennes showed INVALID_TOKEN INVALID_DATA resilience in the second half.';
    const result = stripJsonArtifacts(input);
    expect(result.sanitized).toContain('Rennes showed');
    expect(result.sanitized).toContain('resilience in the second half.');
    expect(result.sanitized).not.toContain('INVALID_');
    expect(result.wasModified).toBe(true);
  });
});

// ── Explicit clean-pass invariant test ───────────────────────────────────────

describe('stripJsonArtifacts — clean-pass invariants', () => {
  it('returns wasModified=false and empty removedPatterns for clean input', () => {
    const result = stripJsonArtifacts('Hello world.');
    expect(result.sanitized).toBe('Hello world.');
    expect(result.wasModified).toBe(false);
    expect(result.removedPatterns).toEqual([]);
  });
});

// ── Deduplication: same category fires multiple times → listed once ──────────

describe('stripJsonArtifacts — deduplication', () => {
  it('lists each pattern category at most once in removedPatterns even when multiple tokens match', () => {
    // Two INVALID_* tokens — both match pattern 5 but category should appear once
    const input = 'The model output INVALID_TOKEN and also INVALID_DATA here.';
    const result = stripJsonArtifacts(input);
    const invalidEntries = result.removedPatterns.filter((p) =>
      p.toLowerCase().includes('invalid'),
    );
    expect(invalidEntries).toHaveLength(1);
  });

  it('lists each XML-tag category once even when multiple tags are removed', () => {
    const input = 'Intro text.</article></output></task> More text.';
    const result = stripJsonArtifacts(input);
    const xmlEntries = result.removedPatterns.filter((p) =>
      p.toLowerCase().includes('xml'),
    );
    expect(xmlEntries).toHaveLength(1);
  });
});

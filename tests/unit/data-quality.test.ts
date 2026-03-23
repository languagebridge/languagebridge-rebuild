import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BRIDGES_PATH = resolve(__dirname, '../../data/standards-pipeline/bridges/ohio_bridge_phrases.json');
const TERMS_PATH = resolve(__dirname, '../../data/standards-pipeline/terms/ohio_standards_terms.json');

describe('Bridge glosses data quality', () => {
  let bridges: any[];

  try {
    bridges = JSON.parse(readFileSync(BRIDGES_PATH, 'utf-8'));
  } catch {
    bridges = [];
  }

  it('file exists and is valid JSON', () => {
    expect(bridges.length).toBeGreaterThan(0);
  });

  it('has at least 1000 terms', () => {
    expect(bridges.length).toBeGreaterThanOrEqual(1000);
  });

  it('every entry has required fields', () => {
    for (const b of bridges) {
      expect(b.term).toBeDefined();
      expect(typeof b.term).toBe('string');
      expect(b.bridge_anchor).toBeDefined();
      expect(typeof b.bridge_anchor).toBe('string');
      expect(b.bridge_scaffold).toBeDefined();
      expect(typeof b.bridge_scaffold).toBe('string');
    }
  });

  it('no empty anchors or scaffolds', () => {
    for (const b of bridges) {
      expect(b.bridge_anchor.trim().length).toBeGreaterThan(0);
      expect(b.bridge_scaffold.trim().length).toBeGreaterThan(0);
    }
  });

  it('anchors are short (median <= 3 words)', () => {
    const lengths = bridges.map(b => b.bridge_anchor.split(' ').length);
    lengths.sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)];
    expect(median).toBeLessThanOrEqual(3);
  });

  it('no duplicate term_normalized values', () => {
    const seen = new Set<string>();
    for (const b of bridges) {
      const key = b.term_normalized;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('all subjects are valid', () => {
    const validSubjects = new Set(['ela', 'math', 'science', 'social-studies']);
    for (const b of bridges) {
      if (b.subjects) {
        for (const s of b.subjects.split('|')) {
          expect(validSubjects.has(s)).toBe(true);
        }
      }
    }
  });

  it('all grade bands are valid', () => {
    const validBands = new Set(['K-2', '3-5', '6-8', '9-12']);
    for (const b of bridges) {
      if (b.grade_bands) {
        for (const g of b.grade_bands.split('|')) {
          expect(validBands.has(g)).toBe(true);
        }
      }
    }
  });

  it('transliteration_difficulty is valid enum', () => {
    const valid = new Set(['high', 'medium', 'low']);
    for (const b of bridges) {
      if (b.transliteration_difficulty) {
        expect(valid.has(b.transliteration_difficulty)).toBe(true);
      }
    }
  });
});

import { SupportedLanguage } from './types';

/**
 * Language variants (dialects / regional forms) — flywheel/VARIANTS.md
 *
 * A variant refines a supported language; it never replaces it. Content is
 * resolved through a fallback chain, most specific first:
 *
 *     es-HN → es-419 → (core spanish) → Azure
 *
 * Most Lexicon entries stay at the core language. A variant entry is stored only
 * where the variant genuinely differs (Honduran voseo, Cuban "guagua"), so the
 * database does not multiply by the number of dialects.
 *
 * Rules:
 *   - A chain NEVER crosses languages. Dari does not fall back to Persian, and
 *     Pashto does not fall back to anything but core Pashto. Dari and Pashto are
 *     separate supported languages, not variants of each other or of Persian.
 *   - A variant is a language preference, never a country of origin. It is
 *     optional, defaults to the core language, and is not shown per student in
 *     any district report (flywheel/TRAINING-DATA-POLICY.md, §Privacy).
 *   - azureVoice / sttLocale are set only where Microsoft publishes that locale
 *     (checked against Microsoft Learn "Language and voice support", 16 Oct 2026).
 *     Variants without them use the core language's voice and recognizer — those
 *     gaps are where our own recordings are the only option.
 */

export type VariantInfo = {
  tag: string;                 // BCP 47
  language: SupportedLanguage;
  label: string;               // English label for admin / reviewer UIs
  studentLabel: string;        // What a student sees ("Spanish — Honduras")
  parent?: string;             // Next variant in the chain before the core language
  azureVoice?: string;         // Azure neural voice for this variant
  sttLocale?: string;          // Azure speech-to-text locale for this variant
};

const V = (v: VariantInfo) => v;

export const LANGUAGE_VARIANTS: Record<string, VariantInfo> = Object.fromEntries([
  // ── Spanish ──────────────────────────────────────────────────────
  V({ tag: 'es-419', language: 'spanish', label: 'Latin American Spanish', studentLabel: 'Spanish — Latin America', azureVoice: 'es-US-PalomaNeural', sttLocale: 'es-US' }),
  V({ tag: 'es-MX', language: 'spanish', label: 'Mexican Spanish', studentLabel: 'Spanish — Mexico', parent: 'es-419', azureVoice: 'es-MX-DaliaNeural', sttLocale: 'es-MX' }),
  V({ tag: 'es-GT', language: 'spanish', label: 'Guatemalan Spanish', studentLabel: 'Spanish — Guatemala', parent: 'es-419', azureVoice: 'es-GT-MartaNeural', sttLocale: 'es-GT' }),
  V({ tag: 'es-HN', language: 'spanish', label: 'Honduran Spanish', studentLabel: 'Spanish — Honduras', parent: 'es-419', azureVoice: 'es-HN-KarlaNeural', sttLocale: 'es-HN' }),
  V({ tag: 'es-SV', language: 'spanish', label: 'Salvadoran Spanish', studentLabel: 'Spanish — El Salvador', parent: 'es-419', azureVoice: 'es-SV-LorenaNeural', sttLocale: 'es-SV' }),
  V({ tag: 'es-CU', language: 'spanish', label: 'Cuban Spanish', studentLabel: 'Spanish — Cuba', parent: 'es-419', azureVoice: 'es-CU-BelkysNeural', sttLocale: 'es-CU' }),
  V({ tag: 'es-DO', language: 'spanish', label: 'Dominican Spanish', studentLabel: 'Spanish — Dominican Republic', parent: 'es-419', azureVoice: 'es-DO-RamonaNeural', sttLocale: 'es-DO' }),
  V({ tag: 'es-PR', language: 'spanish', label: 'Puerto Rican Spanish', studentLabel: 'Spanish — Puerto Rico', parent: 'es-419', azureVoice: 'es-PR-KarinaNeural', sttLocale: 'es-PR' }),
  V({ tag: 'es-VE', language: 'spanish', label: 'Venezuelan Spanish', studentLabel: 'Spanish — Venezuela', parent: 'es-419', azureVoice: 'es-VE-PaolaNeural', sttLocale: 'es-VE' }),
  V({ tag: 'es-CO', language: 'spanish', label: 'Colombian Spanish', studentLabel: 'Spanish — Colombia', parent: 'es-419', azureVoice: 'es-CO-SalomeNeural', sttLocale: 'es-CO' }),

  // ── Arabic ───────────────────────────────────────────────────────
  V({ tag: 'ar-SY', language: 'arabic', label: 'Syrian (Levantine) Arabic', studentLabel: 'Arabic — Syria', azureVoice: 'ar-SY-AmanyNeural', sttLocale: 'ar-SY' }),
  V({ tag: 'ar-LB', language: 'arabic', label: 'Lebanese (Levantine) Arabic', studentLabel: 'Arabic — Lebanon', azureVoice: 'ar-LB-LaylaNeural', sttLocale: 'ar-LB' }),
  V({ tag: 'ar-IQ', language: 'arabic', label: 'Iraqi Arabic', studentLabel: 'Arabic — Iraq', azureVoice: 'ar-IQ-RanaNeural', sttLocale: 'ar-IQ' }),
  V({ tag: 'ar-EG', language: 'arabic', label: 'Egyptian Arabic', studentLabel: 'Arabic — Egypt', azureVoice: 'ar-EG-SalmaNeural', sttLocale: 'ar-EG' }),
  V({ tag: 'ar-YE', language: 'arabic', label: 'Yemeni Arabic', studentLabel: 'Arabic — Yemen', azureVoice: 'ar-YE-MaryamNeural', sttLocale: 'ar-YE' }),
  V({ tag: 'ar-SD', language: 'arabic', label: 'Sudanese Arabic', studentLabel: 'Arabic — Sudan' }),   // no Azure locale

  // ── Pashto ───────────────────────────────────────────────────────
  // Regional tags approximate the dialect split (Southern/Kandahari vs Northern/
  // Yusufzai); the Pashto language lead refines this. No Azure voice for ps-PK.
  V({ tag: 'ps-AF', language: 'pashto', label: 'Afghan Pashto', studentLabel: 'Pashto — Afghanistan', azureVoice: 'ps-AF-LatifaNeural', sttLocale: 'ps-AF' }),
  V({ tag: 'ps-PK', language: 'pashto', label: 'Pakistani Pashto', studentLabel: 'Pashto — Pakistan' }),

  // ── French ───────────────────────────────────────────────────────
  V({ tag: 'fr-CA', language: 'french', label: 'Canadian French', studentLabel: 'French — Canada', azureVoice: 'fr-CA-SylvieNeural', sttLocale: 'fr-CA' }),
  V({ tag: 'fr-CD', language: 'french', label: 'Congolese French', studentLabel: 'French — Congo (DRC)' }),          // no Azure locale

  // ── Portuguese ───────────────────────────────────────────────────
  V({ tag: 'pt-PT', language: 'portuguese', label: 'European Portuguese', studentLabel: 'Portuguese — Portugal', sttLocale: 'pt-PT' }),
  V({ tag: 'pt-AO', language: 'portuguese', label: 'Angolan Portuguese', studentLabel: 'Portuguese — Angola' }),   // no Azure locale
].map((v) => [v.tag, v]));

export function variantsFor(language: string): VariantInfo[] {
  return Object.values(LANGUAGE_VARIANTS).filter((v) => v.language === language);
}

export function isValidVariant(language: string, variant: unknown): variant is string {
  return typeof variant === 'string' && LANGUAGE_VARIANTS[variant]?.language === language;
}

/**
 * Most-specific-first chain of variant tags, ending with null (= core language).
 * An unknown or mismatched variant resolves to the core language only.
 */
export function variantChain(language: string, variant: string | null | undefined): Array<string | null> {
  const chain: Array<string | null> = [];
  let cur = variant && isValidVariant(language, variant) ? LANGUAGE_VARIANTS[variant] : undefined;
  while (cur && !chain.includes(cur.tag)) {
    chain.push(cur.tag);
    cur = cur.parent ? LANGUAGE_VARIANTS[cur.parent] : undefined;
  }
  chain.push(null);
  return chain;
}

/** First non-empty value of `pick` along the chain, or undefined (caller uses the core default). */
export function resolveAlongChain<T>(language: string, variant: string | null | undefined, pick: (v: VariantInfo) => T | undefined): T | undefined {
  for (const tag of variantChain(language, variant)) {
    if (tag === null) return undefined;
    const value = pick(LANGUAGE_VARIANTS[tag]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Position of an entry's variant in the request's chain (0 = exact match).
 * Returns -1 when the entry belongs to a different variant and must not be served.
 */
export function variantRank(chain: Array<string | null>, entryVariant: string | null | undefined): number {
  return chain.indexOf(entryVariant ?? null);
}

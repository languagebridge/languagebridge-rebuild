// extension/content/services/lb-glossary-service.js
// Glossary: organizes translated words by syllable count (3-tier scaffolding).

window.LBGlossaryService = {
  // Simple syllable counter for English words
  countSyllables(word) {
    word = word.toLowerCase().trim();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  },

  // Sort words into 3 tiers
  organize(words) {
    const tiers = {
      tier1: [], // 1 syllable - beginner
      tier2: [], // 2 syllables - intermediate
      tier3: [], // 3+ syllables - advanced
    };

    words.forEach((word) => {
      const count = this.countSyllables(word.english || word);
      if (count <= 1) tiers.tier1.push(word);
      else if (count === 2) tiers.tier2.push(word);
      else tiers.tier3.push(word);
    });

    return tiers;
  },
};
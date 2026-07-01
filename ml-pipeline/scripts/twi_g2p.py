"""
twi_g2p.py

Rule-based grapheme-to-phoneme converter for Twi (Akan).
Twi has a highly regular orthography — spelling maps predictably to pronunciation.

Sources:
  - Harvard ELIAS Akan Sounds: https://elias.fas.harvard.edu/languages/twi/beginning/1/akan-sounds
  - LearnAkan Alphabet: https://learnakan.com/akan-alphabet/
  - Wikipedia Akan language: https://en.wikipedia.org/wiki/Twi
  - Omniglot Akan: https://www.omniglot.com/writing/akan.htm

Phoneme inventory:
  Vowels (7 orthographic, 10 phonemic):
    a → /a/, e → /e/, ɛ → /ɛ/, i → /i/, o → /o/, ɔ → /ɔ/, u → /u/

  Consonants (15 + digraphs):
    b d f g h k l m n p r s t w y
    Digraphs: ky gy hy ny dw tw kw hw nw

  Tone: not marked in standard orthography (handled by acoustic model)
"""


# Digraphs must be checked before single characters
DIGRAPH_MAP = {
    "ky": "tɕ",
    "gy": "dʑ",
    "hy": "ç",
    "ny": "ɲ",
    "dw": "dw",
    "tw": "tw",
    "kw": "kw",
    "hw": "hw",
    "nw": "ŋw",
    "sh": "ʃ",
    "ts": "ts",
}

CHAR_MAP = {
    # Vowels
    "a": "a",
    "e": "e",
    "ɛ": "ɛ",
    "i": "i",
    "o": "o",
    "ɔ": "ɔ",
    "u": "u",
    # Consonants
    "b": "b",
    "d": "d",
    "f": "f",
    "g": "ɡ",  # IPA ɡ (U+0261), not ASCII g
    "h": "h",
    "k": "k",
    "l": "l",
    "m": "m",
    "n": "n",
    "p": "p",
    "r": "ɾ",  # Akan /r/ is typically a tap
    "s": "s",
    "t": "t",
    "w": "w",
    "y": "j",  # Akan 'y' = IPA /j/
    # Additional
    "ŋ": "ŋ",  # Sometimes written directly
}

# Common English loanwords in academic Twi (keep as-is in IPA)
LOANWORD_MAP = {
    "photosynthesis": "fotosˈɪnθəsɪs",
    "chromosome": "kɾˈoːmosoːm",
    "oxygen": "ˈɒksɪdʒən",
    "atom": "ˈatɔm",
    "cell": "sɛl",
}


class TwiG2P:
    """Rule-based Twi grapheme-to-phoneme converter."""

    def __call__(self, text: str) -> tuple[str, None]:
        """Convert Twi text to IPA phonemes.

        Returns (phonemes, None) to match espeak.EspeakG2P interface.
        """
        text = text.strip().lower()

        # Check loanwords first
        if text in LOANWORD_MAP:
            return LOANWORD_MAP[text], None

        phonemes = []
        words = text.split()

        for word_idx, word in enumerate(words):
            if word_idx > 0:
                phonemes.append(" ")

            # Check if it's an English loanword
            if word in LOANWORD_MAP:
                phonemes.append(LOANWORD_MAP[word])
                continue

            i = 0
            while i < len(word):
                # Try digraphs first (2 chars)
                if i + 1 < len(word):
                    digraph = word[i:i+2]
                    if digraph in DIGRAPH_MAP:
                        phonemes.append(DIGRAPH_MAP[digraph])
                        i += 2
                        continue

                # Single character
                char = word[i]
                if char in CHAR_MAP:
                    phonemes.append(CHAR_MAP[char])
                elif char in ".,!?;:-'\"":
                    # Punctuation — skip or keep as-is
                    pass
                else:
                    # Unknown character — pass through
                    phonemes.append(char)
                i += 1

        return "".join(phonemes), None

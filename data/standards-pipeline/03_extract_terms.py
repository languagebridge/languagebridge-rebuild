"""
Step 3: Extract candidate vocabulary terms from Ohio Learning Standards text.

Reads the JSON files produced by 02_extract_text.py and:
  1. Uses spaCy NLP to identify domain-specific nouns, technical terms, academic function words
  2. Cross-references against the Academic Word List (AWL)
  3. Flags Latin/Greek-derived terms as priority bridge candidates
  4. Scores transliteration difficulty (high/medium/low)
  5. Outputs CSV + JSON with term, subject, grade_band, standard_ref, AWL match, score

Does NOT generate bridge phrases — this is clean extraction + scoring only.
"""

import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import spacy

PIPELINE_DIR = Path(__file__).parent
EXTRACTED_DIR = PIPELINE_DIR / "extracted"
OUT_DIR = PIPELINE_DIR / "terms"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Academic Word List (Coxhead 2000) — 570 headwords
# ---------------------------------------------------------------------------

AWL_HEADWORDS = {
    # Sublist 1 (most frequent)
    "analyse", "analyze", "approach", "area", "assess", "assume", "authority",
    "available", "benefit", "concept", "consist", "constitute", "context",
    "contract", "create", "data", "define", "derive", "distribute", "economy",
    "environment", "establish", "estimate", "evident", "export", "factor",
    "finance", "formula", "function", "identify", "income", "indicate",
    "individual", "interpret", "involve", "issue", "labour", "labor", "legal",
    "legislate", "major", "method", "occur", "percent", "period", "policy",
    "principle", "proceed", "process", "require", "research", "respond", "role",
    "section", "sector", "significant", "similar", "source", "specific",
    "structure", "theory", "vary",
    # Sublist 2
    "achieve", "acquire", "administrate", "affect", "appropriate", "aspect",
    "assist", "category", "chapter", "commission", "community", "complex",
    "compute", "conclude", "conduct", "consequent", "construct", "consume",
    "credit", "culture", "design", "distinct", "element", "equate", "evaluate",
    "feature", "final", "focus", "impact", "injure", "institute", "invest",
    "item", "journal", "maintain", "normal", "obtain", "participate", "perceive",
    "positive", "potential", "previous", "primary", "purchase", "range",
    "region", "regulate", "relevant", "reside", "resource", "restrict",
    "secure", "seek", "select", "site", "strategy", "survey", "text",
    "tradition", "transfer",
    # Sublist 3
    "alternative", "circumstance", "comment", "compensate", "component",
    "consent", "considerable", "constant", "constrain", "contribute",
    "convention", "coordinate", "core", "corporate", "correspond", "criteria",
    "deduce", "demonstrate", "document", "dominate", "emphasis", "ensure",
    "exclude", "framework", "fund", "illustrate", "immigrate", "imply",
    "initial", "instance", "interact", "justify", "layer", "link", "locate",
    "maximize", "minor", "negate", "outcome", "partner", "philosophy",
    "physical", "proportion", "publish", "react", "register", "rely", "remove",
    "scheme", "sequence", "sex", "shift", "specify", "sufficient", "task",
    "technical", "technique", "technology", "valid", "volume",
    # Sublist 4
    "access", "adequate", "annual", "apparent", "approximate", "attitude",
    "attribute", "civil", "code", "commit", "communicate", "concentrate",
    "confer", "contrast", "cycle", "debate", "despite", "dimension",
    "domestic", "emerge", "error", "ethnic", "goal", "grant", "hence",
    "hypothesis", "implement", "implicate", "impose", "integrate", "internal",
    "investigate", "job", "label", "mechanism", "obvious", "occupy", "option",
    "output", "overall", "parallel", "parameter", "phase", "predict",
    "principal", "prior", "professional", "project", "promote", "regime",
    "resolve", "retain", "series", "statistic", "status", "stress",
    "subsequent", "sum", "summary", "undertake",
    # Sublist 5
    "academy", "adjust", "alter", "amend", "aware", "capacity", "challenge",
    "clause", "compound", "conflict", "consult", "contact", "decline",
    "discrete", "draft", "enable", "energy", "enforce", "entity", "equivalent",
    "evolve", "expand", "expose", "external", "facilitate", "fundamental",
    "generate", "generation", "image", "liberal", "licence", "license", "logic",
    "margin", "medical", "mental", "modify", "monitor", "network", "notion",
    "objective", "orient", "perspective", "precise", "prime", "psychology",
    "pursue", "ratio", "reject", "revenue", "stable", "style", "substitute",
    "sustain", "symbol", "target", "transit", "trend", "version", "welfare",
    # Sublist 6
    "abstract", "accurate", "acknowledge", "aggregate", "allocate", "assign",
    "attach", "author", "bond", "brief", "capable", "cite", "cooperate",
    "discriminate", "display", "diverse", "domain", "edit", "enhance",
    "estate", "exceed", "expert", "explicit", "federal", "fee", "flexible",
    "furthermore", "gender", "ignorant", "incentive", "incidence", "incorporate",
    "index", "inhibit", "initiate", "input", "instruct", "intelligence",
    "interval", "lecture", "migrate", "minimum", "ministry", "motive",
    "neutral", "nevertheless", "overseas", "precede", "presume", "rational",
    "recover", "reveal", "scope", "subsidy", "tape", "trace", "transform",
    "transport", "underlie", "utility",
    # Sublist 7
    "adapt", "adult", "advocate", "aid", "channel", "chemical", "classic",
    "comprehensive", "comprise", "confirm", "contrary", "convert", "couple",
    "decade", "definite", "deny", "differentiate", "dispose", "dynamic",
    "eliminate", "empirical", "equip", "extract", "file", "finite", "found",
    "globe", "grade", "guarantee", "hierarchy", "identical", "ideology",
    "infer", "innovate", "insert", "intervene", "isolate", "media", "mode",
    "paradigm", "phenomenon", "priority", "prohibit", "publication", "quote",
    "release", "reverse", "simulate", "sole", "somewhat", "submit",
    "successor", "survive", "thesis", "topic", "transmit", "ultimate",
    "unique", "visible", "voluntary",
    # Sublist 8
    "abandon", "accompany", "accumulate", "ambiguous", "append", "appreciate",
    "arbitrary", "automate", "bias", "chart", "clarify", "commodity",
    "complement", "conform", "contemporary", "contradict", "crucial",
    "currency", "denote", "detect", "deviate", "displace", "drama",
    "eventual", "exhibit", "exploit", "fluctuate", "guideline", "highlight",
    "implicit", "induce", "inevitable", "infrastructure", "inspect",
    "intense", "manipulate", "minimize", "nuclear", "offset", "paragraph",
    "plus", "practitioner", "predominant", "prospect", "radical", "random",
    "reinforce", "restore", "revise", "schedule", "tense", "terminate",
    "theme", "thereby", "uniform", "vehicle", "via", "virtual", "visual",
    "widespread",
    # Sublist 9
    "accommodate", "analogy", "anticipate", "assure", "attain", "behalf",
    "bulk", "cease", "coherent", "coincide", "commence", "compatible",
    "concurrent", "confine", "controversy", "converse", "device", "devote",
    "diminish", "distort", "duration", "erode", "ethical", "format",
    "founded", "inherent", "insight", "integral", "intermediate", "manual",
    "mature", "mediate", "medium", "military", "minimal", "mutual", "norm",
    "overlap", "passive", "portion", "preliminary", "protocol", "qualitative",
    "refine", "relax", "restrain", "revolution", "rigid", "route", "scenario",
    "sphere", "subordinate", "supplement", "suspend", "team", "temporary",
    "trigger", "unify", "violate", "vision",
    # Sublist 10
    "adjacent", "albeit", "assemble", "collapse", "colleague", "compile",
    "conceive", "convince", "depress", "encounter", "enormous", "forthcoming",
    "incline", "integrity", "intrinsic", "invoke", "levy", "likewise",
    "nonetheless", "notwithstanding", "odd", "ongoing", "panel", "persist",
    "pose", "reluctant", "so-called", "straightforward", "undergo", "whereby",
}

# Also match morphological variants
AWL_STEMS = set()
for w in AWL_HEADWORDS:
    AWL_STEMS.add(w)
    # Common suffixed forms
    for suffix in ["s", "ed", "ing", "er", "tion", "sion", "ment", "ness",
                   "ity", "al", "ial", "ive", "ous", "ly", "able", "ible"]:
        if w.endswith("e") and suffix.startswith(("i", "a")):
            AWL_STEMS.add(w[:-1] + suffix)
        else:
            AWL_STEMS.add(w + suffix)

# ---------------------------------------------------------------------------
# Latin / Greek morpheme detection
# ---------------------------------------------------------------------------

LATIN_PREFIXES = {
    "ab", "ad", "ante", "bi", "circum", "co", "com", "con", "contra",
    "de", "dis", "ex", "extra", "in", "im", "inter", "intra", "multi",
    "non", "ob", "per", "post", "pre", "pro", "re", "retro", "semi",
    "sub", "super", "trans", "tri", "ultra", "un", "uni",
}

GREEK_PREFIXES = {
    # "a"/"an" removed — too many false positives (algorithm, atmosphere, approach)
    # Only match "a-" when followed by a known Greek root (handled in check_latin_greek)
    "anti", "auto", "bio", "chrono", "di", "dys", "eco",
    "geo", "hemi", "hetero", "homo", "hyper", "hypo", "iso", "macro",
    "mega", "meta", "micro", "mono", "neo", "pan", "para", "peri",
    "photo", "poly", "proto", "pseudo", "psycho", "syn", "tele", "thermo",
}

# Greek privative "a-"/"an-" only counts before known Greek roots
GREEK_PRIVATIVE_ROOTS = {
    "morph", "typ", "symmetr", "chron", "bol", "path", "the",
    "tom", "pher", "gnost", "nom", "nym", "erob", "biotic",
}

LATIN_SUFFIXES = {
    "tion", "sion", "ment", "ence", "ance", "ible", "able", "ous", "ive",
    "al", "ial", "ual", "ant", "ent", "ure", "ity", "ory", "ary",
    "ular", "cle", "tude", "fy", "ify",
}

GREEK_SUFFIXES = {
    "ism", "ist", "logy", "ology", "graph", "graphy", "meter", "metry",
    "phyte", "scope", "scopy", "thesis", "phobia", "philia", "cracy",
    "crat", "morph", "nomy", "path", "pathy", "phone", "type",
}

LATIN_ROOTS = {
    "aqua", "aud", "bene", "cent", "civ", "clar", "cred", "dict", "duc",
    "equi", "fac", "fract", "grav",
    "ject", "junct", "luc", "magn", "mater", "mit",
    "mort", "mov", "mult", "numer",
    "omni", "oper", "pater", "pend", "port",
    "prim", "punct", "quer", "rect", "rupt", "scrib", "script", "sect",
    "sens", "sequ", "serv", "sign", "simil", "spec",
    "spir", "stab", "struct", "tang", "tact", "temp",
    "terr", "tract",
    "vid", "vis", "vit", "voc",
    # Removed ambiguous short roots that cause false positives:
    # "fer" (differ, offer), "fid" (find), "form" (form is common English),
    # "fort" (fortress, comfort), "gen" (general, gentle — overlap w/ Greek),
    # "hab" (habit is common), "mal" (animal, decimal), "man" (manage, many),
    # "mob" (mobile is common), "nat" (nation, nature — too broad),
    # "neg" (negative), "nom" (nominal — overlap w/ Greek), "nov" (novel),
    # "pac" (pack), "ped" (sped, speed), "pel" (spell), "pos" (possible — too broad),
    # "sol" (solution, solid), "stat" (state — too common), "stru" (structure — use struct),
    # "ten" (ten, often), "val" (value — too common), "ven" (event, prevent),
    # "ver" (very, over), "vol" (volume — too common)
}

GREEK_ROOTS = {
    "anthrop", "arch", "aster", "astr", "bibl", "chron", "cosm", "crypt",
    "cycl", "derm", "dynam", "ethn", "gnos", "graph",
    "gyn", "heli", "hydr", "kine", "lith", "morph", "neur",
    "orth", "path", "phil", "phon", "phot", "phys",
    "pneu", "psych", "pyr", "soph", "techn", "tele",
    "therm", "troph",
    # Removed short/ambiguous: "dem" (democracy vs demand), "gen" (overlap w/ Latin),
    # "log" (too many false hits), "nom" (overlap w/ Latin), "opt" (option),
    # "pol" (policy, pollution), "the" (matches 'the' in 'other'),
    # "top" (topography vs top), "zo" (too short)
}

# Common English words to skip (not useful for academic vocabulary)
STOP_TERMS = {
    "student", "students", "grade", "grades", "standard", "standards",
    "ohio", "page", "learning", "strand", "content", "teacher", "teachers",
    "school", "schools", "use", "using", "used", "year", "years",
    "include", "includes", "including", "example", "examples",
    "state", "states", "topic", "topics", "statement", "statements",
    "model", "curriculum", "unit", "lesson", "objective", "objectives",
    "benchmark", "indicator", "indicators", "skill", "skills",
    "read", "reading", "write", "writing", "speak", "speaking",
    "listen", "listening", "know", "knowledge", "understand", "understanding",
    "able", "ability", "can", "will", "may", "should",
    "demonstrate", "explain", "describe", "apply", "recognize",
    "following", "number", "numbers", "part", "parts",
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "first", "second", "third", "new", "also", "well", "way", "ways",
    "time", "times", "information", "note", "notes", "table", "figure",
    "appendix", "chapter", "section", "introduction", "overview",
    "common", "core", "practice", "practices", "key", "idea", "ideas",
    "work", "group", "groups", "class", "classroom", "classrooms",
    "level", "levels", "test", "testing", "answer", "question", "questions",
    "see", "show", "shows", "make", "makes", "making", "give", "given",
    "take", "form", "forms", "type", "types", "set", "get", "let",
    "different", "many", "much", "each", "other", "another", "same",
    "end", "point", "points", "line", "lines", "place", "places",
    "high", "low", "long", "short", "large", "small", "big",
    "help", "need", "needs", "thing", "things", "people", "world",
    "day", "days", "life", "order", "change", "changes",
    "ohio's", "ohio's",
    # Non-academic everyday words (false positives from previous run)
    "adopte", "checklist", "everyday", "kindergarten", "readiness",
    "american", "internet", "website", "online", "click",
    "mom", "dad", "boy", "girl", "kid", "kids", "baby",
    "dog", "cat", "car", "bus", "bed", "door", "window",
    "color", "red", "blue", "green", "yellow", "black", "white",
    "hand", "foot", "head", "eye", "face", "body",
    "food", "water", "house", "home", "room", "floor",
    "step", "steps", "list", "name", "names", "word", "words",
    "right", "left", "top", "bottom", "side", "back", "front",
    "picture", "photo", "video", "game", "play", "song",
    "page", "pages", "book", "books", "story", "stories",
    # PDF/document artifacts
    "pdf", "aspx", "http", "https", "www", "html",
    "copyright", "reserved", "permission", "page",
    # Institutional terms (not student-facing academic vocab)
    "committee", "coordinator", "advisory", "department",
    "superintendent", "administrator", "specialist",
    "adopted", "revised", "edition", "appendix", "glossary",
}


def check_latin_greek(term: str) -> Tuple[bool, bool, List[str]]:
    """Check if a term has Latin or Greek morphemes. Returns (is_latin, is_greek, evidence)."""
    t = term.lower()
    evidence = []

    is_latin = False
    is_greek = False

    # Check Latin prefixes (need minimum remaining length)
    for p in sorted(LATIN_PREFIXES, key=len, reverse=True):
        if t.startswith(p) and len(t) > len(p) + 2:
            is_latin = True
            evidence.append(f"L-prefix:{p}")
            break

    # Check Greek prefixes
    for p in sorted(GREEK_PREFIXES, key=len, reverse=True):
        if t.startswith(p) and len(t) > len(p) + 2:
            is_greek = True
            evidence.append(f"G-prefix:{p}")
            break

    # Check Greek privative a-/an- only before known Greek roots
    if not is_greek and (t.startswith("a") or t.startswith("an")):
        remainder = t[2:] if t.startswith("an") else t[1:]
        for root in GREEK_PRIVATIVE_ROOTS:
            if remainder.startswith(root):
                is_greek = True
                prefix = "an" if t.startswith("an") else "a"
                evidence.append(f"G-prefix:{prefix}+{root}")
                break

    # Check suffixes
    for s in sorted(LATIN_SUFFIXES, key=len, reverse=True):
        if t.endswith(s) and len(t) > len(s) + 2:
            is_latin = True
            evidence.append(f"L-suffix:{s}")
            break

    for s in sorted(GREEK_SUFFIXES, key=len, reverse=True):
        if t.endswith(s) and len(t) > len(s) + 2:
            is_greek = True
            evidence.append(f"G-suffix:{s}")
            break

    # Check roots (substring match, min 4-char term)
    if len(t) >= 4:
        for r in LATIN_ROOTS:
            if r in t and len(r) >= 3:
                is_latin = True
                evidence.append(f"L-root:{r}")
                break

        for r in GREEK_ROOTS:
            if r in t and len(r) >= 3:
                is_greek = True
                evidence.append(f"G-root:{r}")
                break

    return is_latin, is_greek, evidence


def score_transliteration_difficulty(
    term: str, is_latin: bool, is_greek: bool, evidence: List[str]
) -> str:
    """
    Score how hard a term is to transliterate into non-Latin scripts.

    High: long, multi-morpheme, Latin/Greek clusters, no cognate likely
    Medium: moderate length, some familiar morphemes
    Low: short, common international borrowing, or phonetically simple
    """
    t = term.lower()
    syllable_est = max(1, len(re.findall(r"[aeiouy]+", t)))
    morpheme_count = len(evidence)

    # Consonant clusters are hard for many L1s
    clusters = re.findall(r"[bcdfghjklmnpqrstvwxyz]{3,}", t)

    score = 0

    # Length and complexity
    if len(t) >= 12:
        score += 3
    elif len(t) >= 8:
        score += 2
    elif len(t) >= 5:
        score += 1

    # Syllable complexity
    if syllable_est >= 5:
        score += 2
    elif syllable_est >= 3:
        score += 1

    # Morphological complexity
    if morpheme_count >= 3:
        score += 2
    elif morpheme_count >= 1:
        score += 1

    # Consonant clusters
    score += len(clusters)

    # Latin/Greek = harder for non-Indo-European languages
    if is_latin and is_greek:
        score += 2
    elif is_latin or is_greek:
        score += 1

    if score >= 5:
        return "high"
    elif score >= 3:
        return "medium"
    else:
        return "low"


def extract_standard_ref(text: str, subject: str) -> Optional[str]:
    """Try to extract an Ohio standard reference code from surrounding text."""
    patterns = [
        r"([A-Z]{1,4}\.\d+\.\d+(?:\.\d+)?)",      # e.g. RL.3.1, W.5.2.a
        r"(\d+\.[A-Z]{1,4}\.\d+(?:\.\d+)?)",        # e.g. 3.NBT.1
        r"([A-Z]-[A-Z]{2,4}\.\d+\.\d+)",            # e.g. K-CC.1.2
        r"((?:RI|RL|W|SL|L|RF)\.\d+\.\d+[a-z]?)",  # ELA specific
        r"((?:OA|NBT|MD|NF|G|RP|NS|EE|SP|F)\.\d+)", # Math domains
    ]
    for pat in patterns:
        match = re.search(pat, text)
        if match:
            return match.group(1)
    return None


def is_valid_term(token) -> bool:
    """Check if a spaCy token is a valid candidate term."""
    text = token.text.lower().strip()

    if len(text) < 3 or len(text) > 40:
        return False
    if text in STOP_TERMS:
        return False
    if not text.isalpha():
        return False
    if token.is_stop:
        return False
    if token.pos_ not in ("NOUN", "ADJ", "PROPN"):
        return False

    return True


def is_valid_chunk(chunk) -> bool:
    """Check if a spaCy noun chunk is a valid multi-word term."""
    text = chunk.text.lower().strip()

    if len(text.split()) < 2 or len(text.split()) > 4:
        return False
    if len(text) < 5 or len(text) > 60:
        return False

    # Must contain at least one content word that isn't a stop term
    has_content = any(
        t.text.lower() not in STOP_TERMS and not t.is_stop and t.pos_ in ("NOUN", "ADJ")
        for t in chunk
    )
    return has_content


def normalize_term(text: str) -> str:
    """Normalize a term for deduplication."""
    return re.sub(r"\s+", " ", text.lower().strip())


def process_document(nlp, doc_record: dict) -> List[dict]:
    """Extract candidate terms from one document record."""
    subject = doc_record["subject"]
    grade_band = doc_record["grade_band"]
    source_file = doc_record["source_file"]

    text = doc_record.get("grade_band_text", "") or doc_record.get("full_text", "")
    if not text:
        return []

    # Process in chunks to avoid memory issues with large docs
    terms = {}  # normalized_term -> term_record
    chunk_size = 100000  # chars

    for start in range(0, len(text), chunk_size):
        chunk_text = text[start:start + chunk_size]
        doc = nlp(chunk_text)

        # Extract single-word terms
        for token in doc:
            if not is_valid_term(token):
                continue

            lemma = token.lemma_.lower()
            norm = normalize_term(lemma)

            if norm in STOP_TERMS or len(norm) < 3:
                continue

            if norm not in terms:
                std_ref = extract_standard_ref(
                    chunk_text[max(0, token.idx - 200):token.idx + 200],
                    subject,
                )
                is_latin, is_greek, evidence = check_latin_greek(norm)
                awl_match = norm in AWL_HEADWORDS or norm in AWL_STEMS
                difficulty = score_transliteration_difficulty(norm, is_latin, is_greek, evidence)

                terms[norm] = {
                    "term": lemma,
                    "term_normalized": norm,
                    "is_multi_word": False,
                    "subject": subject,
                    "grade_band": grade_band,
                    "source_file": source_file,
                    "standard_ref": std_ref,
                    "awl_match": awl_match,
                    "is_latin_derived": is_latin,
                    "is_greek_derived": is_greek,
                    "etymology_evidence": "|".join(evidence) if evidence else None,
                    "is_bridge_priority": is_latin or is_greek or awl_match,
                    "transliteration_difficulty": difficulty,
                    "frequency": 0,
                    "pos": token.pos_,
                }

            terms[norm]["frequency"] += 1

        # Extract multi-word terms (noun chunks)
        for chunk in doc.noun_chunks:
            if not is_valid_chunk(chunk):
                continue

            # Use the head noun's lemma + modifiers
            words = []
            for t in chunk:
                if not t.is_stop and t.pos_ in ("NOUN", "ADJ", "PROPN"):
                    words.append(t.lemma_.lower())

            if len(words) < 2:
                continue

            multi_term = " ".join(words)
            norm = normalize_term(multi_term)

            if norm in terms:
                terms[norm]["frequency"] += 1
                continue

            std_ref = extract_standard_ref(
                chunk_text[max(0, chunk.start_char - 200):chunk.end_char + 200],
                subject,
            )
            # Check etymology of the head noun
            head = chunk.root.lemma_.lower()
            is_latin, is_greek, evidence = check_latin_greek(head)
            awl_match = any(
                (t.lemma_.lower() in AWL_HEADWORDS or t.lemma_.lower() in AWL_STEMS)
                for t in chunk if not t.is_stop
            )
            difficulty = score_transliteration_difficulty(
                multi_term, is_latin, is_greek, evidence
            )

            terms[norm] = {
                "term": multi_term,
                "term_normalized": norm,
                "is_multi_word": True,
                "subject": subject,
                "grade_band": grade_band,
                "source_file": source_file,
                "standard_ref": std_ref,
                "awl_match": awl_match,
                "is_latin_derived": is_latin,
                "is_greek_derived": is_greek,
                "etymology_evidence": "|".join(evidence) if evidence else None,
                "is_bridge_priority": is_latin or is_greek or awl_match,
                "transliteration_difficulty": difficulty,
                "frequency": 1,
                "pos": "NP",
            }

    return list(terms.values())


def main():
    print("Loading spaCy model...")
    nlp = spacy.load("en_core_web_sm", disable=["ner"])
    nlp.max_length = 200000

    # Load extracted JSON files
    manifest_path = EXTRACTED_DIR / "manifest.json"
    if not manifest_path.exists():
        print("ERROR: Run 02_extract_text.py first.")
        sys.exit(1)

    with open(manifest_path) as f:
        manifest = json.load(f)

    all_terms = []  # global deduplicated list
    global_terms = {}  # norm -> record (keeps best version)

    for json_file in manifest["files"]:
        path = EXTRACTED_DIR / json_file
        print(f"\nProcessing: {json_file}")

        with open(path) as f:
            docs = json.load(f)

        for doc_record in docs:
            subject = doc_record["subject"]
            band = doc_record["grade_band"]
            src = doc_record["source_file"]
            print(f"  {subject}/{band}/{src}...", end="", flush=True)

            terms = process_document(nlp, doc_record)
            print(f" {len(terms)} terms")

            for t in terms:
                norm = t["term_normalized"]
                if norm not in global_terms:
                    global_terms[norm] = t
                    # Track all subjects/grade_bands this term appears in
                    global_terms[norm]["subjects"] = [t["subject"]]
                    global_terms[norm]["grade_bands"] = [t["grade_band"]]
                else:
                    existing = global_terms[norm]
                    existing["frequency"] += t["frequency"]
                    if t["subject"] not in existing["subjects"]:
                        existing["subjects"].append(t["subject"])
                    if t["grade_band"] not in existing["grade_bands"]:
                        existing["grade_bands"].append(t["grade_band"])
                    # Keep the best standard ref
                    if not existing["standard_ref"] and t["standard_ref"]:
                        existing["standard_ref"] = t["standard_ref"]
                    # Upgrade bridge priority if any source flags it
                    if t["is_bridge_priority"]:
                        existing["is_bridge_priority"] = True

    # ---------------------------------------------------------------
    # POST-PROCESSING: Dedup word families, filter multi-word junk
    # ---------------------------------------------------------------

    # 1. Filter bad multi-word terms
    multi_word_stop_fragments = {
        "ohio", "state test", "appendix", "page", "table of content",
        "b.", "c.", "d.", "e.", "standard", "adopte", "revised",
        "checklist", "readiness", "curriculum", "model curriculum",
    }
    filtered_terms = {}
    mw_removed = 0
    for norm, t in global_terms.items():
        if t["is_multi_word"]:
            # Remove terms with stop fragments
            skip = False
            for frag in multi_word_stop_fragments:
                if frag in norm:
                    skip = True
                    break
            # Remove 4+ word terms (too specific / not real terms)
            if len(norm.split()) > 3:
                skip = True
            # Must have frequency > 1 (hapax = likely noise)
            if t["frequency"] <= 1:
                skip = True
            if skip:
                mw_removed += 1
                continue
        filtered_terms[norm] = t

    print(f"\nRemoved {mw_removed} junk multi-word terms")

    # 2. Deduplicate word families — keep the highest-frequency form
    #    e.g., government/governed/governing → keep "government"
    COMMON_SUFFIXES = [
        "ation", "tion", "sion", "ment", "ness", "ity", "ance", "ence",
        "ical", "ial", "al", "ive", "ous", "ful", "less", "ing", "ed",
        "able", "ible", "ly", "er", "or", "ist", "ic",
    ]

    def get_word_family_key(term):
        """Crude stemming to group word families."""
        t = term.lower()
        for suf in sorted(COMMON_SUFFIXES, key=len, reverse=True):
            if t.endswith(suf) and len(t) - len(suf) >= 4:
                return t[:-len(suf)]
        return t

    # Group single-word terms by family
    families = defaultdict(list)
    for norm, t in filtered_terms.items():
        if not t["is_multi_word"]:
            key = get_word_family_key(norm)
            families[key].append((norm, t))

    # For each family, keep the highest-frequency entry, merge metadata
    deduped_terms = {}
    family_removed = 0
    for family_key, members in families.items():
        if len(members) == 1:
            norm, t = members[0]
            deduped_terms[norm] = t
            continue

        # Sort by frequency, keep the best
        members.sort(key=lambda x: -x[1]["frequency"])
        best_norm, best = members[0]

        # Merge subjects/grade_bands/frequency from siblings
        for other_norm, other in members[1:]:
            best["frequency"] += other["frequency"]
            for s in other.get("subjects", [other.get("subject", "")]):
                if isinstance(best.get("subjects"), list) and s not in best["subjects"]:
                    best["subjects"].append(s)
            for g in other.get("grade_bands", [other.get("grade_band", "")]):
                if isinstance(best.get("grade_bands"), list) and g not in best["grade_bands"]:
                    best["grade_bands"].append(g)
            if not best["standard_ref"] and other["standard_ref"]:
                best["standard_ref"] = other["standard_ref"]
            if other["is_bridge_priority"]:
                best["is_bridge_priority"] = True
            family_removed += 1

        deduped_terms[best_norm] = best

    # Add back multi-word terms
    for norm, t in filtered_terms.items():
        if t["is_multi_word"]:
            deduped_terms[norm] = t

    print(f"Merged {family_removed} duplicate word-family forms")
    print(f"Terms after cleanup: {len(deduped_terms)}")

    # Sort: bridge priority first, then by frequency
    all_terms = sorted(
        deduped_terms.values(),
        key=lambda t: (not t["is_bridge_priority"], -t["frequency"]),
    )

    # Flatten subjects/grade_bands for output
    for t in all_terms:
        if isinstance(t.get("subjects"), list):
            t["subjects"] = "|".join(sorted(set(t["subjects"])))
        if isinstance(t.get("grade_bands"), list):
            t["grade_bands"] = "|".join(sorted(set(t["grade_bands"])))

    # --- Save JSON ---
    json_path = OUT_DIR / "ohio_standards_terms.json"
    with open(json_path, "w") as f:
        json.dump(all_terms, f, indent=2, ensure_ascii=False)

    # --- Save CSV ---
    csv_path = OUT_DIR / "ohio_standards_terms.csv"
    csv_fields = [
        "term", "term_normalized", "is_multi_word", "subjects", "grade_bands",
        "standard_ref", "awl_match", "is_latin_derived", "is_greek_derived",
        "etymology_evidence", "is_bridge_priority", "transliteration_difficulty",
        "frequency", "pos",
    ]
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore")
        writer.writeheader()
        for t in all_terms:
            writer.writerow(t)

    # --- Stats ---
    total = len(all_terms)
    bridge = sum(1 for t in all_terms if t["is_bridge_priority"])
    awl = sum(1 for t in all_terms if t["awl_match"])
    latin = sum(1 for t in all_terms if t["is_latin_derived"])
    greek = sum(1 for t in all_terms if t["is_greek_derived"])
    high_diff = sum(1 for t in all_terms if t["transliteration_difficulty"] == "high")
    multi = sum(1 for t in all_terms if t["is_multi_word"])

    print(f"\n{'='*60}")
    print(f"TERM EXTRACTION COMPLETE")
    print(f"{'='*60}")
    print(f"Total unique terms:      {total:,}")
    print(f"Bridge priority terms:   {bridge:,} ({100*bridge/total:.1f}%)")
    print(f"AWL matches:             {awl:,}")
    print(f"Latin-derived:           {latin:,}")
    print(f"Greek-derived:           {greek:,}")
    print(f"High translit difficulty: {high_diff:,}")
    print(f"Multi-word terms:        {multi:,}")
    print(f"\nOutput:")
    print(f"  JSON: {json_path}")
    print(f"  CSV:  {csv_path}")
    print(f"{'='*60}")

    # Save extraction manifest
    extraction_manifest = {
        "pipeline": "languagebridge_lexicon",
        "step": "02_term_extraction",
        "source": "Ohio K-12 Learning Standards",
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "total_terms": total,
        "bridge_priority_terms": bridge,
        "awl_matches": awl,
        "latin_derived": latin,
        "greek_derived": greek,
        "high_transliteration_difficulty": high_diff,
        "multi_word_terms": multi,
        "output_files": ["ohio_standards_terms.json", "ohio_standards_terms.csv"],
    }
    with open(OUT_DIR / "manifest.json", "w") as f:
        json.dump(extraction_manifest, f, indent=2)


if __name__ == "__main__":
    main()

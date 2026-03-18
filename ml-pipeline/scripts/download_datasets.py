from datasets import load_dataset
import os

BASE = "/Volumes/MLTraining/languagebridge-ml/data/raw"
os.makedirs(BASE, exist_ok=True)

print("=== MOZILLA COMMON VOICE ===")
CV = "mozilla-foundation/common_voice_17_0"

langs = [
    ("arabic",     "ar"),
    ("french",     "fr"),
    ("spanish",    "es"),
    ("portuguese", "pt"),
    ("ukrainian",  "uk"),
    ("urdu",       "ur"),
    ("uzbek",      "uz"),
    ("vietnamese", "vi"),
    ("nepali",     "ne-NP"),
    ("dari",       "fa"),
    ("pashto",     "ps"),
    ("burmese",    "my"),
]

for name, code in langs:
    print(f"Downloading {name}...")
    ds = load_dataset(CV, code, split="train", trust_remote_code=True)
    ds.save_to_disk(f"{BASE}/{name}")
    print(f"Done: {name}")

print("=== PERSIAN SUPPLEMENTAL ===")
load_dataset("MahtaFetrat/Mana-TTS").save_to_disk(f"{BASE}/persian_manatts")
print("Done: persian_manatts")

load_dataset("Thomcles/Persian-Farsi-Speech").save_to_disk(f"{BASE}/persian_cleaned")
print("Done: persian_cleaned")

load_dataset("pymmdrza/PERSIAN_FARSI_NARRATION").save_to_disk(f"{BASE}/persian_narration")
print("Done: persian_narration")

print("=== SOMALI ===")
load_dataset("Somali-tts/somali-tts-datasets").save_to_disk(f"{BASE}/somali")
print("Done: somali")

print("=== TWI ===")
load_dataset("michsethowusu/twi-words-speech-text-parallel-400k").save_to_disk(f"{BASE}/twi_400k")
print("Done: twi_400k")

load_dataset("ghananlpcommunity/twi-speech-text-multispeaker-16k").save_to_disk(f"{BASE}/twi_multispeaker")
print("Done: twi_multispeaker")

print("=== SWAHILI ===")
load_dataset("bookbot/OpenBible_Swahili", "clean", trust_remote_code=True).save_to_disk(f"{BASE}/swahili_bible")
print("Done: swahili_bible")

load_dataset("michsethowusu/swahili-words-speech-text-parallel").save_to_disk(f"{BASE}/swahili_words")
print("Done: swahili_words")

print("=== AMHARIC ===")
load_dataset("badrex/amharic-speech").save_to_disk(f"{BASE}/amharic")
print("Done: amharic")

print("=== HAITIAN CREOLE ===")
load_dataset("jsbeaudry/creole-text-voice").save_to_disk(f"{BASE}/haitian_creole_main")
print("Done: haitian_creole_main")

load_dataset("jsbeaudry/cmu_haitian_creole_speech").save_to_disk(f"{BASE}/haitian_creole_cmu")
print("Done: haitian_creole_cmu")

print("=== ALL DOWNLOADS COMPLETE ===")

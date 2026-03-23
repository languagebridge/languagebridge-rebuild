#!/usr/bin/env python3
"""
evaluate_all_voices.py

Generate test audio for ALL 22+ languages using the voice router.
Produces a grading folder with WAV files organized by language, plus
an HTML report you can open in a browser to listen and score each one.

Usage:
  python scripts/evaluate_all_voices.py
  python scripts/evaluate_all_voices.py --languages dari arabic french
  python scripts/evaluate_all_voices.py --output-dir /tmp/tts_eval_all

Output:
  {output_dir}/
    {language}/
      hello.wav
      teacher.wav
      science_bridge.wav
      long_sentence.wav
    report.html          ← open in browser to listen and grade
"""

import argparse
import json
import os
import sys
import time
import wave
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "scripts"))

# ---------------------------------------------------------------------------
# Test phrases per language — short greeting, school word, academic bridge,
# and a longer sentence. These test different aspects of TTS quality.
# ---------------------------------------------------------------------------

TEST_PHRASES = {
    "dari": [
        ("hello", "سلام"),
        ("teacher", "معلم"),
        ("science_bridge", "روندی که گیاهان از نور آفتاب غذا می‌سازند"),
        ("long_sentence", "دانش آموزان در صنف درس می‌خوانند و معلم به آنها کمک می‌کند"),
    ],
    "pashto": [
        ("hello", "سلام"),
        ("teacher", "ښوونکی"),
        ("science_bridge", "هغه پروسه چې بوټي له لمر رڼا څخه خواړه جوړوي"),
        ("long_sentence", "زده کونکي په ټولګي کې درس لولي او ښوونکی ورسره مرسته کوي"),
    ],
    "persian": [
        ("hello", "سلام"),
        ("teacher", "معلم"),
        ("science_bridge", "فرآیندی که گیاهان از نور خورشید غذا می‌سازند"),
        ("long_sentence", "دانش‌آموزان در کلاس درس می‌خوانند و معلم به آنها کمک می‌کند"),
    ],
    "arabic": [
        ("hello", "مرحبا كيف حالك"),
        ("teacher", "المعلم"),
        ("science_bridge", "العملية التي تصنع بها النباتات غذاءها من ضوء الشمس"),
        ("long_sentence", "يدرس الطلاب في الصف ويساعدهم المعلم على فهم الدرس"),
    ],
    "urdu": [
        ("hello", "السلام علیکم"),
        ("teacher", "استاد"),
        ("science_bridge", "وہ عمل جس سے پودے سورج کی روشنی سے خوراک بناتے ہیں"),
        ("long_sentence", "طالب علم کلاس میں پڑھتے ہیں اور استاد ان کی مدد کرتے ہیں"),
    ],
    "ukrainian": [
        ("hello", "Привіт, як справи"),
        ("teacher", "Вчитель"),
        ("science_bridge", "Процес, завдяки якому рослини виробляють їжу з сонячного світла"),
        ("long_sentence", "Учні навчаються в класі, а вчитель допомагає їм зрозуміти урок"),
    ],
    "spanish": [
        ("hello", "Hola, cómo estás"),
        ("teacher", "Maestro"),
        ("science_bridge", "El proceso por el cual las plantas producen alimento a partir de la luz del sol"),
        ("long_sentence", "Los estudiantes estudian en clase y el maestro les ayuda a entender la lección"),
    ],
    "french": [
        ("hello", "Bonjour, comment allez-vous"),
        ("teacher", "Professeur"),
        ("science_bridge", "Le processus par lequel les plantes fabriquent leur nourriture à partir de la lumière du soleil"),
        ("long_sentence", "Les élèves étudient en classe et le professeur les aide à comprendre la leçon"),
    ],
    "portuguese": [
        ("hello", "Olá, como vai você"),
        ("teacher", "Professor"),
        ("science_bridge", "O processo pelo qual as plantas produzem alimento a partir da luz do sol"),
        ("long_sentence", "Os alunos estudam na sala de aula e o professor os ajuda a entender a lição"),
    ],
    "swahili": [
        ("hello", "Habari yako"),
        ("teacher", "Mwalimu"),
        ("science_bridge", "Mchakato ambao mimea hutumia mwanga wa jua kutengeneza chakula"),
        ("long_sentence", "Wanafunzi wanasoma darasani na mwalimu anawasaidia kuelewa somo"),
    ],
    "vietnamese": [
        ("hello", "Xin chào, bạn khỏe không"),
        ("teacher", "Thầy giáo"),
        ("science_bridge", "Quá trình cây xanh tạo ra thức ăn từ ánh sáng mặt trời"),
        ("long_sentence", "Học sinh học trong lớp và thầy giáo giúp các em hiểu bài"),
    ],
    "nepali": [
        ("hello", "नमस्ते"),
        ("teacher", "शिक्षक"),
        ("science_bridge", "बिरुवाले सूर्यको प्रकाशबाट खाना बनाउने प्रक्रिया"),
        ("long_sentence", "विद्यार्थीहरू कक्षामा पढ्छन् र शिक्षकले उनीहरूलाई बुझ्न मद्दत गर्छन्"),
    ],
    "uzbek": [
        ("hello", "Salom"),
        ("teacher", "O'qituvchi"),
        ("science_bridge", "O'simliklar quyosh nuridan ozuqa tayyorlaydigan jarayon"),
        ("long_sentence", "Talabalar sinfda o'qiydilar va o'qituvchi ularga darsni tushunishga yordam beradi"),
    ],
    "burmese": [
        ("hello", "မင်္ဂလာပါ"),
        ("teacher", "ဆရာ"),
        ("science_bridge", "အပင်များ နေရောင်ခြည်ဖြင့် အစာထုတ်လုပ်သည့် လုပ်ငန်းစဉ်"),
        ("long_sentence", "ကျောင်းသားများ အတန်းထဲတွင် စာသင်ကြပြီး ဆရာက သူတို့ကို နားလည်အောင် ကူညီပါသည်"),
    ],
    "amharic": [
        ("hello", "ሰላም"),
        ("teacher", "መምህር"),
        ("science_bridge", "ተክሎች ከፀሀይ ብርሃን ምግብ የሚሠሩበት ሂደት"),
        ("long_sentence", "ተማሪዎች በክፍል ውስጥ ይማራሉ እና መምህሩ ትምህርቱን እንዲረዱ ይረዳቸዋል"),
    ],
    "somali": [
        ("hello", "Iska warran"),
        ("teacher", "Macalin"),
        ("science_bridge", "Habka ay dhirtu cuntada uga sameeyaan iftiinka qorraxda"),
        ("long_sentence", "Ardayda waxay ku bartaan fasalka macalinkuna wuu ka caawiyaa inay fahmaan casharka"),
    ],
    "tagalog": [
        ("hello", "Kumusta ka"),
        ("teacher", "Guro"),
        ("science_bridge", "Ang proseso kung saan gumagawa ang mga halaman ng pagkain mula sa sikat ng araw"),
        ("long_sentence", "Nag-aaral ang mga estudyante sa klase at tinutulungan sila ng guro na maunawaan ang aralin"),
    ],
    "kinyarwanda": [
        ("hello", "Muraho"),
        ("teacher", "Umwarimu"),
        ("science_bridge", "Inzira ibimera bikoresha mu gukora ibiribwa biva mu mucyo wa izuba"),
        ("long_sentence", "Abanyeshuri bigira mu ishuri umwarimu akabafasha kumva isomo"),
    ],
    "twi": [
        ("hello", "Ɛte sɛn"),
        ("teacher", "Ɔkyerɛkyerɛfo"),
        ("science_bridge", "Ɔkwan a nnua de yɛ aduane fi owia hann mu"),
        ("long_sentence", "Sukuufo no sua ade wɔ klaas no mu na ɔkyerɛkyerɛfo no boa wɔn nte ade no ase"),
    ],
    "tigrinya": [
        ("hello", "ሰላም"),
        ("teacher", "መምህር"),
        ("science_bridge", "ተኽልታት ካብ ብርሃን ጸሓይ መግቢ ዝሰርሓሉ መስርሕ"),
        ("long_sentence", "ተመሃሮ ኣብ ክፍሊ ይመሃሩ መምህር ድማ ትምህርቲ ክርድኡ ይሕግዞም"),
    ],
}


def synthesize_piper(text, model_name, output_path):
    """Generate audio with Piper."""
    from piper import PiperVoice
    piper_dir = BASE / "voices" / "piper"
    onnx = piper_dir / f"{model_name}.onnx"
    if not onnx.exists():
        return False, "model not found"
    voice = PiperVoice.load(str(onnx))
    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(voice.config.sample_rate)
        voice.synthesize_wav(text, wf)
    return True, "ok"


def synthesize_kokoro(text, language, output_path):
    """Generate audio with Kokoro."""
    import soundfile as sf_lib
    import torch
    from kokoro import KModel, KPipeline
    from misaki import espeak
    from phoneme_map import get_espeak_code, clean_phonemes, can_use_kokoro

    if not can_use_kokoro(language):
        return False, "no G2P backend"

    espeak_code = get_espeak_code(language)
    if not espeak_code:
        return False, "no espeak code"

    g2p = espeak.EspeakG2P(language=espeak_code)
    phonemes, _ = g2p(text)
    phonemes = clean_phonemes(phonemes, language)
    if not phonemes:
        return False, "no phonemes"

    model = KModel(repo_id="hexgrad/Kokoro-82M")

    # Load fine-tuned weights if available
    ft_path = BASE / "models" / language / f"{language}_tts_v1.pth"
    if ft_path.exists():
        state = torch.load(ft_path, map_location="cpu")
        model.load_state_dict(state, strict=False)

    # Load voice pack
    voice_path = BASE / "voices" / f"{language}.pt"
    if voice_path.exists():
        voice_pack = torch.load(voice_path, map_location="cpu")
    else:
        pipeline = KPipeline(lang_code="a", model=False)
        voice_pack = pipeline.load_voice("af_heart")

    idx = min(len(phonemes) - 1, voice_pack.shape[0] - 1)
    ref_s = voice_pack[idx]

    with torch.no_grad():
        out = model(phonemes, ref_s, speed=1.0, return_output=True)

    sf_lib.write(output_path, out.audio.numpy(), 24000)
    return True, "ok"


def generate_html_report(output_dir, results):
    """Generate an HTML report with embedded audio players."""
    html = """<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>LanguageBridge Voice Evaluation</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
  h1 { border-bottom: 3px solid #333; padding-bottom: 10px; }
  .lang-section { margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
  .lang-header { display: flex; justify-content: space-between; align-items: center; }
  .backend-tag { padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: bold; }
  .piper { background: #d4edda; color: #155724; }
  .kokoro { background: #cce5ff; color: #004085; }
  .sample { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; }
  .sample-label { font-weight: bold; margin-bottom: 5px; }
  .fail { color: #dc3545; }
  .grade-input { width: 60px; padding: 4px; font-size: 16px; margin-left: 10px; }
  table { border-collapse: collapse; width: 100%; margin-top: 20px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f0f0f0; }
</style>
</head><body>
<h1>LanguageBridge Voice Evaluation</h1>
<p>Listen to each sample and grade 1-5. (1=unusable, 3=ok for beta, 5=production ready)</p>
"""

    summary_rows = []

    for lang, samples in sorted(results.items()):
        backend = samples[0]["backend"] if samples else "unknown"
        tag_class = "piper" if backend == "piper" else "kokoro"

        html += f"""
<div class="lang-section">
  <div class="lang-header">
    <h2>{lang}</h2>
    <span class="backend-tag {tag_class}">{backend}</span>
    <span>Grade: <input type="number" class="grade-input" min="1" max="5" id="grade_{lang}"></span>
  </div>
"""
        ok_count = 0
        for s in samples:
            if s["success"]:
                rel_path = f"{lang}/{s['name']}.wav"
                html += f"""
  <div class="sample">
    <div class="sample-label">{s['name']}</div>
    <audio controls src="{rel_path}"></audio>
    <span style="color:#888; margin-left:10px; font-size:12px;">{s['text'][:60]}...</span>
  </div>"""
                ok_count += 1
            else:
                html += f"""
  <div class="sample">
    <div class="sample-label">{s['name']}</div>
    <span class="fail">FAILED: {s['error']}</span>
  </div>"""

        html += "\n</div>\n"
        summary_rows.append((lang, backend, ok_count, len(samples)))

    # Summary table
    html += """
<h2>Summary</h2>
<table>
  <tr><th>Language</th><th>Backend</th><th>Samples</th><th>Grade</th></tr>
"""
    for lang, backend, ok, total in summary_rows:
        html += f"  <tr><td>{lang}</td><td>{backend}</td><td>{ok}/{total}</td><td id='sum_{lang}'></td></tr>\n"

    html += """</table>
<script>
document.querySelectorAll('.grade-input').forEach(input => {
  input.addEventListener('change', () => {
    const lang = input.id.replace('grade_', '');
    const cell = document.getElementById('sum_' + lang);
    if (cell) cell.textContent = input.value;
  });
});
</script>
</body></html>"""

    report_path = os.path.join(output_dir, "report.html")
    with open(report_path, "w") as f:
        f.write(html)
    return report_path


def main():
    from voice_router import VOICE_MAP, get_voice_config

    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", "-o", default="/tmp/tts_eval_all")
    parser.add_argument("--languages", "-l", nargs="*", default=None)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    languages = args.languages or sorted(TEST_PHRASES.keys())

    print(f"Evaluating {len(languages)} languages → {output_dir}")
    print()

    results = {}

    for lang in languages:
        phrases = TEST_PHRASES.get(lang)
        if not phrases:
            print(f"  [{lang}] No test phrases defined — skipping")
            continue

        lang_dir = output_dir / lang
        lang_dir.mkdir(parents=True, exist_ok=True)

        cfg = VOICE_MAP.get(lang)
        if not cfg:
            print(f"  [{lang}] Not in voice router — skipping")
            continue

        backend = cfg.backend
        print(f"  [{lang}] backend={backend} ...", end="", flush=True)

        samples = []
        for name, text in phrases:
            out_path = str(lang_dir / f"{name}.wav")
            try:
                if backend == "piper":
                    ok, err = synthesize_piper(text, cfg.piper_model, out_path)
                else:
                    ok, err = synthesize_kokoro(text, lang, out_path)
                samples.append({
                    "name": name, "text": text, "backend": backend,
                    "success": ok, "error": err if not ok else None,
                })
            except Exception as e:
                samples.append({
                    "name": name, "text": text, "backend": backend,
                    "success": False, "error": str(e)[:100],
                })

        ok_count = sum(1 for s in samples if s["success"])
        print(f" {ok_count}/{len(samples)} samples")
        results[lang] = samples

    # Generate HTML report
    report_path = generate_html_report(str(output_dir), results)
    print(f"\nReport: {report_path}")
    print(f"Open:   open {report_path}")


if __name__ == "__main__":
    main()

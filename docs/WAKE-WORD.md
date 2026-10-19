# Train the "Hey Echo" wake word

About an hour, mostly waiting. Free, in your browser. You don't record anything: the notebook trains from synthetic voices. (Checked 2026-10-18 against openWakeWord's official training notebook.)

## Steps

1. Open the official notebook: https://colab.research.google.com/drive/1q1oe2zOyZp7UsB3jJiQ1IFn8z5YfjwEb?usp=sharing and sign in with a Google account.
2. Faster (optional but worth it): **Runtime → Change runtime type → T4 GPU → Save**.
3. In **Step 1**, set `target_word` to:
   ```
   hey_echo
   ```
   Click the ▶ next to that cell. After a few minutes it plays a sample. If "Hey Echo" sounds right, go on; if not, try `hey_ecko`.
4. Leave the sliders at their defaults the first time (`number_of_examples` 1000, `number_of_training_steps` 10000, `false_activation_penalty` 1500).
5. **Runtime → Run all.** Keep the tab open. If it says the runtime needs restarting, accept and **Run all** again.
6. After ~1 hour your browser downloads **`hey_echo.onnx`** (and a `.tflite` you can ignore).
7. Put `hey_echo.onnx` in Cockpit's **`wake/`** folder (next to `melspectrogram.onnx`), then restart Cockpit.
8. **Settings (Ctrl+,) → Voice → Wake word: on.** The note under it should say *Listening for “Hey Echo”.*

Cockpit picks a file with "echo" in its name over the stand-in, so you can leave `hey_jarvis_v0.1.onnx` where it is.

## If it misfires or misses

- **Too many false triggers** (it wakes without you saying it): retrain with `false_activation_penalty` higher (e.g. 3000) and `number_of_examples` 3000+.
- **Misses you** often: retrain with more `number_of_examples` (3000–5000) and `number_of_training_steps` (20000). Takes longer.
- Tell me either way: the detection threshold (0.5 now) can be tuned without retraining.

## Privacy

With the wake word on, the mic stays open (Windows shows the mic icon), but the audio goes only to the detector on this PC. Nothing reaches a speech service until the word is heard; then it's the same as holding the talk key, and it stops when you stop speaking.

## License note

The training notebook and openWakeWord's code are Apache-2.0. openWakeWord's own pretrained models (like the "Hey Jarvis" stand-in) are licensed for non-commercial use only; fine for personal use, revisit if Cockpit is ever sold.

## Trained locally instead (2026-10-19, what's installed now)

`wake/hey_echo.onnx` was trained on Nick's PC (RTX 4070 SUPER) with the same notebook's steps, in `C:\Users\user\cockpit-wakeword\` (outside the repo; ~22 GB, Python 3.11 venv). Settings: `target_word` `hey_echo`, **5,000 examples, 20,000 steps**, false-activation penalty 1500. Training run ~25 min.

Result (`npm run wake-eval -- <model> <clips dir>`, Cockpit's own detector, threshold 0.5), on Deepgram voices it never trained on:
- fires on **13 of 15** "Hey Echo" clips (0.93–0.94); the misses were one clip that sounds like "pay echo" and one with a very slow, drawn-out "heyyy … echo"
- **0 false fires** on ordinary speech, "echo" mid-sentence, near-misses ("Hey Ellie", "heck") and "Hey Jarvis"
- trainer's own noisy test set: accuracy 0.76, recall 0.53, 0.62 false positives/hour

Windows fixes the notebook needed (all in the training folder, not in Cockpit):
1. `piper-phonemize` has no Windows build: a small `piper_phonemize` shim calls piper-tts's bundled espeak-ng.
2. Training DataLoader: no worker processes on Windows (a generator can't be pickled).
3. Version pins: pyarrow 14.0.2 (for datasets 2.14.6), numpy 1.26.4, scipy 1.13.1, setuptools < 80; onnxruntime preloaded via `sitecustomize.py` (pyarrow 14's DLLs otherwise break it).
4. AudioSet moved to Parquet (`data/bal_train/09.parquet`): read directly.
5. The DeepPhonemizer download (S3) is gone (403): look-alike phrases use "hey echo" with a space so the CMU dictionary covers it.
6. Windows can't delete a still-mapped file: close the memory maps before trimming.

**To retrain stronger** (if it misses you in real use): edit `my_model.yaml.py` there (e.g. `n_samples` 20000, `steps` 40000), run it, delete `my_custom_model/`, then run the three stages again (`train.py --training_config my_model.yaml --generate_clips`, `--augment_clips`, `--train_model`). About an hour.

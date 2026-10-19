# Phase 1 — Companion: make it a buddy you talk to

**Goal:** talk to Cockpit and hear it answer. Push-to-talk first, wake word after; Bloom moves with the real audio; recurring quests come from templates.
**Done when:** Nick runs a full quest by voice only (push-to-talk), the companion answers out loud in the right voice (Playful with the companion, Steady while a card is up), and the time from releasing the talk key to hearing the first word is measured and under the target set in Task 1.
**Out of scope:** presence dial / timed check-ins (after Phase 1), agents (Phase 2), the setup-time comparison (deferred until Cockpit is fully built).

Decisions (2026-10-18, Nick): **measure ElevenLabs and Deepgram first, then pick** the speech provider from real numbers; **push-to-talk both ways** — hold Right Ctrl inside Cockpit, and tap Ctrl+Alt+V from any app (Electron can't see a global key release, so that one is tap to start, tap to stop).

Facts checked 2026-10-18 (official docs): the Claude API takes text, images and PDFs — **no audio in or out**, so speech-to-text (STT) and text-to-speech (TTS) are separate services; Claude stays the brain.
- ElevenLabs: STT `wss://api.elevenlabs.io/v1/speech-to-text/realtime` (`scribe_v2_realtime`, ~150 ms, JSON chunks `input_audio_chunk` with base64 PCM, `commit_strategy` manual/vad/turn_prediction); TTS `POST /v1/text-to-speech/{voice_id}/stream` (`eleven_flash_v2_5`, ~75 ms model time, `output_format=pcm_16000`), header `xi-api-key`.
- Deepgram: STT `wss://api.deepgram.com/v1/listen` (`nova-3`, binary linear16 frames, `Finalize` / `CloseStream` messages, `is_final` / `speech_final`); TTS `POST /v1/speak?model=aura-2-…`, header `Authorization: Token <key>`, audio streams back as it's generated.

Rules from CLAUDE.md still apply. Keys live in `.env` (main process only). Audio leaves the PC **only while the talk key is active** (or, later, after the wake word fires).

---

## Task 1: Measure the voice loop (pick the provider)
- [x] `npm run voice-latency` (scripts/voice-latency.ts): for each provider with a key in `.env`, time (a) end of speech → final transcript (STT), (b) Claude's first sentence (same client and model as the companion), (c) text → first audio byte (TTS). Uses a recording of Nick's voice if given (`--wav`), else a phrase synthesized by the other provider. 5 runs each, median + worst.
- [x] Nick listens to one sample sentence from each voice (Playful and Steady candidates) and picks.
- [x] Record the numbers, the chosen provider and the target ("release key → first word") in FEATURES §0.
- **Done when:** a provider is chosen from measured numbers and the target is written down.

## Task 2: Microphone + push-to-talk
- [x] Renderer captures the mic (`getUserMedia`, 16 kHz mono PCM via an AudioWorklet) only while talking; Electron's permission handler allows the mic for Cockpit's own page only.
- [x] Hold Right Ctrl (in Cockpit) / tap Ctrl+Alt+V (anywhere) → listening; release / tap again → send. Esc cancels. A visible "Listening…" state on the Say box.
- [x] Audio frames go to the main process (IPC); the orchestrator owns the STT connection (rule 4). Live partial transcript shows as the "You" caption; the final text goes through the existing reply path (engine first, else Claude).
- [x] Bloom: `listening` while the key is held, its level driven by the mic.
- **Done when:** holding Right Ctrl and saying "yeah" advances the demo quest, from inside Cockpit and from another app with Ctrl+Alt+V. *(Verified with recorded speech through the real Deepgram path: 4 spoken turns, final transcript 35–107 ms after release. Still to check by hand: Nick's own mic, Right Ctrl and Ctrl+Alt+V on a real keyboard.)*

## Task 3: The companion speaks
- [ ] Every companion line (scripted beats and Claude's replies) is spoken via TTS; Claude's reply starts speaking at its first sentence, not when it's done.
- [ ] Bloom's voice level comes from the real audio (RMS ~30×/s) instead of the typewriter.
- [ ] Barge-in: pressing the talk key stops the companion mid-sentence.
- [ ] Mute toggle (Settings + key M) and volume; calm mode keeps speech on but quieter visuals.
- **Done when:** the demo quest is spoken end to end, and talking over the companion stops it.

## Task 4: Two voices
- [ ] Map Playful and Steady to voice settings (voice, speed, style) of the chosen provider; Auto switches with the context, as the text voice does today.
- **Done when:** Nick hears the switch when a card opens and when a step finishes.

## Task 5: Measure in the app
- [ ] Log each spoken turn: key release → transcript → first Claude text → first audio. `npm run measure -- voice` prints medians.
- **Done when:** the median is under the Task 1 target over a real session.

## Task 6: Wake word
- [ ] Pick the engine after checking current docs and licensing (Porcupine Web SDK vs openWakeWord on ONNX Runtime). Detection runs locally; nothing is sent until it fires.
- [ ] Settings: wake word on/off (default off until it's reliable). Push-to-talk keeps working.
- **Done when:** saying the wake word starts listening reliably in a quiet room, and a 30-minute session with music on gives no more than one false trigger.

## Task 7: Quest templates
- [ ] `templates/*.md` = a quest file plus `schedule` (e.g. `weekdays 08:30`); Quest Forge can save a quest as a template.
- [ ] On the first launch of a scheduled day the template becomes a queued quest (or active if nothing is), once per day.
- **Done when:** pre-market prep appears ready on a weekday morning without Nick creating it.

---

### Hardest part
Latency. If Nick waits too long after releasing the key, voice is worse than typing. Task 1 measures it before anything is built on top, and Task 5 keeps measuring it.

### Verify before building
- Electron mic permission and AudioWorklet in the app's Chromium (152) — check in Task 2.
- Current pricing on each provider's rate card before signing up (third-party listings disagree).

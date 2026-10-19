// The companion voices offered in Settings → Voice (Deepgram Aura-2).
// Nick's picks, 2026-10-18: Thalia first, plus four lighter male voices
// (the baritone/deep ones were left out on purpose). Traits for the male
// voices are Deepgram's own descriptions (docs.deepgram.com, tts-models).
export interface VoiceOption {
  id: string;
  name: string;
  kind: 'Female' | 'Male';
  traits: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: 'aura-2-thalia-en',
    name: 'Thalia',
    kind: 'Female',
    traits: 'Your first pick',
  },
  {
    id: 'aura-2-apollo-en',
    name: 'Apollo',
    kind: 'Male',
    traits: 'Confident, casual',
  },
  {
    id: 'aura-2-aries-en',
    name: 'Aries',
    kind: 'Male',
    traits: 'Warm, energetic',
  },
  {
    id: 'aura-2-atlas-en',
    name: 'Atlas',
    kind: 'Male',
    traits: 'Enthusiastic, friendly',
  },
  {
    id: 'aura-2-hermes-en',
    name: 'Hermes',
    kind: 'Male',
    traits: 'Expressive, engaging',
  },
];

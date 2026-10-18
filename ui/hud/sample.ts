import type { HudModel } from './types';

// Static data for the Task 2 HUD. Replaced by the orchestrator's quest files in Task 3.
export const SAMPLE_HUD: HudModel = {
  quest: {
    title: 'Launch the Fiverr Gig',
    doneWhen:
      'Complete when the gig is published with packages, copy, images and two portfolio samples.',
    objectives: [
      'Research what sells',
      'Pick niche + 3 packages',
      'Write gig copy',
      'Make gig images',
      'Build 2 portfolio demos',
      'Publish + route notifications',
    ],
    bundle: [
      { name: 'Fiverr / research' },
      { name: 'fiverr.com' },
      { name: 'Fiverr / copy' },
      { name: 'Canva' },
      { name: 'n8n demos', stale: true },
      { name: 'Drive / portfolio', stale: true },
    ],
  },
  queue: [
    'Pre-market prep',
    'Follow up with trial leads',
    'Script next avatar episode',
  ],
};

export const COMPANION_LINES = {
  listening: "I'm listening. Talk me through what you're seeing.",
  thinking: 'Checking the top gigs against the niche you picked…',
  speaking:
    'Three of the top gigs bundle a setup call. Worth adding to Standard?',
  waiting: "Your move. Start with the top 10 gigs; I'll log what stands out.",
  working: "Opening this quest's tabs and folders. Keep going.",
} as const;

export const AI_LABELS = {
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  waiting: 'Your move',
  working: 'Party working',
} as const;

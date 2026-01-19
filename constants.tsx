
import { Voice } from './types';

export const SAMPLE_SCRIPTS = {
  en: [
    "The quick brown fox jumps over the lazy dog.",
    "Artificial intelligence is transforming the way we interact with technology.",
    "I believe that storytelling is the most powerful way to put ideas into the world today."
  ],
  ur: [
    "سورج مشرق سے نکلتا ہے اور مغرب میں غروب ہوتا ہے۔",
    "کامیابی کا راز محنت اور مسلسل جدوجہد میں پوشیدہ ہے۔",
    "کہانی سنانا ایک فن ہے جو دلوں کو جوڑتا ہے۔"
  ]
};

export const VOICES: Voice[] = [
  {
    id: 'v-urdu-1',
    name: 'Sultan (Dastango)',
    previewUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sultan',
    category: 'Narrative',
    tags: ['Urdu', 'Epic', 'Classic'],
    geminiVoice: 'Charon',
    description: 'Deep, resonant Urdu voice optimized for classical storytelling and epics.'
  },
  {
    id: 'v-urdu-2',
    name: 'Zoya (Kahani-kar)',
    previewUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoya',
    category: 'Narrative',
    tags: ['Urdu', 'Soft', 'Warm'],
    geminiVoice: 'Kore',
    description: 'Soothing and melodic Urdu voice, perfect for children\'s stories and emotional poems.'
  },
  {
    id: 'v1',
    name: 'Rachel',
    previewUrl: 'https://picsum.photos/seed/rachel/200',
    category: 'Professional',
    tags: ['Calm', 'Warm', 'Narrative'],
    geminiVoice: 'Kore',
    description: 'A soothing and clear professional voice perfect for audiobooks and narrations.'
  },
  {
    id: 'v2',
    name: 'Clyde',
    previewUrl: 'https://picsum.photos/seed/clyde/200',
    category: 'Narrative',
    tags: ['Deep', 'Authoritative', 'News'],
    geminiVoice: 'Charon',
    description: 'Deep and resonant, ideal for documentary narration and strong announcements.'
  },
  {
    id: 'v3',
    name: 'Bella',
    previewUrl: 'https://picsum.photos/seed/bella/200',
    category: 'Conversational',
    tags: ['Energetic', 'Friendly', 'Youthful'],
    geminiVoice: 'Zephyr',
    description: 'Bright and optimistic voice suited for social media content and podcasts.'
  }
];

export const INITIAL_SETTINGS = {
  stability: 50,
  similarity: 75,
  styleExaggeration: 0
};

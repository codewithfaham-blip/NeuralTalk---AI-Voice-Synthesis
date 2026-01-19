
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
    id: 'v-bilingual-1',
    name: 'Aria (Bilingual)',
    previewUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aria',
    category: 'Conversational',
    tags: ['Urdu', 'English', 'Modern'],
    geminiVoice: 'Zephyr',
    description: 'Expertly handles code-switching between Urdu and English with a modern, friendly tone.'
  },
  {
    id: 'v-urdu-1',
    name: 'Sultan (Dastango)',
    previewUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sultan',
    category: 'Narrative',
    tags: ['Urdu', 'Epic', 'Deep'],
    geminiVoice: 'Charon',
    description: 'Deep, resonant Urdu voice optimized for classical storytelling and epics.'
  },
  {
    id: 'v-urdu-2',
    name: 'Zoya (Kahani-kar)',
    previewUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoya',
    category: 'Narrative',
    tags: ['Urdu', 'Soft', 'Bilingual'],
    geminiVoice: 'Kore',
    description: 'Soothing Urdu voice, great for children\'s stories. Also handles English vocabulary naturally.'
  },
  {
    id: 'v1',
    name: 'Rachel',
    previewUrl: 'https://picsum.photos/seed/rachel/200',
    category: 'Professional',
    tags: ['English', 'Calm', 'Warm'],
    geminiVoice: 'Kore',
    description: 'A soothing and clear professional voice perfect for audiobooks and narrations.'
  },
  {
    id: 'v2',
    name: 'Clyde',
    previewUrl: 'https://picsum.photos/seed/clyde/200',
    category: 'Narrative',
    tags: ['English', 'Deep', 'Authoritative'],
    geminiVoice: 'Charon',
    description: 'Deep and resonant, ideal for documentary narration and strong announcements.'
  },
  {
    id: 'v3',
    name: 'Fenrir',
    previewUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fenrir',
    category: 'Character',
    tags: ['English', 'Rough', 'Old'],
    geminiVoice: 'Fenrir',
    description: 'Gritty and textured voice, perfect for fantasy characters and villains.'
  }
];

export const INITIAL_SETTINGS = {
  stability: 50,
  similarity: 75,
  styleExaggeration: 0
};

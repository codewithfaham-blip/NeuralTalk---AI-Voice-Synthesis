
export interface Voice {
  id: string;
  name: string;
  previewUrl: string;
  category: 'Professional' | 'Narrative' | 'Character' | 'Conversational' | 'Custom';
  tags: string[];
  geminiVoice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  description: string;
  isCustom?: boolean;
  sampleData?: string; // Base64 audio sample
}

export interface VoiceHistory {
  id: string;
  text: string;
  voiceName: string;
  timestamp: number;
  audioData: Uint8Array;
}

export interface GenerationSettings {
  stability: number;
  similarity: number;
  styleExaggeration: number;
}

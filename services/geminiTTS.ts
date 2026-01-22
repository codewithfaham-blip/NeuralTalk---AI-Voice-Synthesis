
import { GoogleGenAI, Modality } from "@google/genai";
import { decode } from "../utils/audioUtils.ts";
import { Voice } from "../types.ts";

/**
 * Detects language composition of the text
 */
function getLanguageProfile(text: string) {
  const urduPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const englishPattern = /[a-zA-Z]/;
  const hasUrdu = urduPattern.test(text);
  const hasEnglish = englishPattern.test(text);
  return { hasUrdu, hasEnglish, isBilingual: hasUrdu && hasEnglish };
}

export async function generateSpeech(
  text: string, 
  voice: Voice,
  settings: { stability: number; similarity: number; styleExaggeration: number }
): Promise<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const profile = getLanguageProfile(text);
  
  // If it's a custom (cloned) voice, use the Native Audio model for imitation
  if (voice.isCustom && voice.sampleData) {
    const base64Data = voice.sampleData.split(',')[1] || voice.sampleData;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: voice.sampleMimeType || 'audio/wav',
                data: base64Data
              }
            },
            {
              text: `You are a professional voice actor. Listen to the provided audio sample carefully. 
              Now, using the EXACT SAME voice, tone, accent, and timbre from that sample, please read the following text. 
              Do not add any background noise. Just the clear voice output.
              
              Text to read: ${text}`
            }
          ]
        }
      ],
      config: {
        responseModalities: [Modality.AUDIO]
      }
    });

    const audioPart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    if (!audioPart?.inlineData?.data) {
      throw new Error("Neural cloning engine failed to synthesize audio.");
    }
    return decode(audioPart.inlineData.data);
  }

  // Fallback to standard high-quality TTS for prebuilt voices
  let styleInstruction = "";
  if (profile.isBilingual) {
    styleInstruction = "Seamlessly switch between English and Urdu with a natural narrative flow. ";
  } else if (profile.hasUrdu) {
    styleInstruction = "Classic Urdu storytelling (Dastangoi) style. Focus on poetic rhythm. ";
  } else {
    styleInstruction = settings.stability > 70 ? "Professional and clear. " : "Expressive and cinematic. ";
  }

  const prompt = `${styleInstruction} Text: ${text}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice.geminiVoice as any },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("TTS engine returned no data.");
  return decode(base64Audio);
}

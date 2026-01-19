
import { GoogleGenAI, Modality } from "@google/genai";
import { decode } from "../utils/audioUtils";

/**
 * Access API key safely from the environment.
 * The platform typically injects this, but we fallback to an empty string to avoid crashes.
 */
const getApiKey = () => {
  try {
    // Check both standard process.env and window.process for maximum compatibility
    return (typeof process !== 'undefined' ? process.env.API_KEY : (window as any).process?.env?.API_KEY) || '';
  } catch (e) {
    return '';
  }
};

/**
 * Detects language composition of the text with higher precision
 */
function getLanguageProfile(text: string) {
  const urduPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const englishPattern = /[a-zA-Z]/;
  
  const hasUrdu = urduPattern.test(text);
  const hasEnglish = englishPattern.test(text);
  
  return {
    hasUrdu,
    hasEnglish,
    isBilingual: hasUrdu && hasEnglish,
    primary: hasUrdu ? 'Urdu' : 'English'
  };
}

export async function generateSpeech(
  text: string, 
  voiceName: string, 
  settings: { stability: number; similarity: number; styleExaggeration: number }
): Promise<Uint8Array> {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const profile = getLanguageProfile(text);
  
  // Refined Prompt Engineering for Seamless Bilingual Storytelling
  let styleInstruction = "";
  
  if (profile.isBilingual) {
    styleInstruction = `
      This text contains a mix of English and Urdu. 
      Please perform a seamless bilingual narration:
      1. For Urdu words, use a rich, traditional 'Dastangoi' tone with deep emotional resonance.
      2. For English words, use a clear, modern, and natural accent.
      3. Ensure the transitions between languages are smooth and do not sound robotic.
      4. Maintain the overall narrative flow as if a single fluent bilingual speaker is telling a story.
    `;
  } else if (profile.hasUrdu) {
    styleInstruction = "Read this text in a classic Urdu storytelling style. Focus on the 'Urdu-ness' of the pronunciation (Tahaffuz), specifically the deep 'kh' and 'gh' sounds and the poetic rhythm. ";
    if (settings.stability > 70) styleInstruction += "Keep the delivery formal and elegant. ";
    else styleInstruction += "Add emotional gravity and dramatic pauses between sentences. ";
  } else {
    styleInstruction = settings.stability > 70 
      ? "Deliver a professional, clear, and neutral English narration. " 
      : "Deliver a highly expressive and cinematic English story performance. ";
  }

  if (settings.styleExaggeration > 50) {
    styleInstruction += "Use extremely theatrical and high-energy vocal variations. ";
  }

  const prompt = `${styleInstruction.trim()}

Text to narrate: ${text}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName as any },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("No audio data received from Gemini API. Ensure your API Key is correctly configured.");
  }

  return decode(base64Audio);
}

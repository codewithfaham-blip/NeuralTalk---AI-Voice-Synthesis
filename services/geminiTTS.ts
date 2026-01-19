
import { GoogleGenAI, Modality } from "@google/genai";
import { decode } from "../utils/audioUtils";

const API_KEY = process.env.API_KEY || '';

/**
 * Detects language composition of the text
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
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const profile = getLanguageProfile(text);
  
  // Sophisticated Prompt Engineering for Bilingual Scenarios
  let styleInstruction = "";
  
  if (profile.isBilingual) {
    styleInstruction = "This text is bilingual (English and Urdu). Read the Urdu parts in a warm, traditional style and transition smoothly into clear, natural English for the English words. Maintain a consistent emotional tone across both languages. ";
  } else if (profile.hasUrdu) {
    styleInstruction = "Read this in a deep, traditional Urdu storytelling (Dastangoi) style. Focus on correct 'tahaffuz' (pronunciation) and emotional cadence. ";
    if (settings.stability > 70) styleInstruction += "Use a steady, formal 'Zaban' (language) style. ";
    else styleInstruction += "Use dramatic pauses and vocal variations common in classical Urdu narration. ";
  } else {
    styleInstruction = settings.stability > 70 
      ? "Read with professional, steady, and extremely clear English pronunciation. " 
      : "Read with expressive, cinematic English storytelling variations. ";
  }

  if (settings.styleExaggeration > 50) {
    styleInstruction += "Inject high levels of drama, passion, and theatrical flair into the performance. ";
  }

  const prompt = `${styleInstruction}
  
Text to synthesize: ${text}`;

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
    throw new Error("No audio data received from Gemini API");
  }

  return decode(base64Audio);
}


import { GoogleGenAI, Modality } from "@google/genai";
import { decode } from "../utils/audioUtils";

const API_KEY = process.env.API_KEY || '';

/**
 * Detects if the string contains a significant amount of Urdu/Arabic characters
 */
function isUrduText(text: string): boolean {
  const urduPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return urduPattern.test(text);
}

export async function generateSpeech(
  text: string, 
  voiceName: string, 
  settings: { stability: number; similarity: number; styleExaggeration: number }
): Promise<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const isUrdu = isUrduText(text);
  
  // Advanced Prompt Engineering for Storytelling
  let styleInstruction = "";
  
  if (isUrdu) {
    styleInstruction = "Read this in a deep, traditional Urdu storytelling (Dastangoi) style. ";
    if (settings.stability > 70) styleInstruction += "Use clear, formal pronunciation. ";
    else styleInstruction += "Add emotional depth and natural dramatic pauses. ";
  } else {
    styleInstruction = settings.stability > 70 
      ? "Read with very steady, formal and clear pronunciation. " 
      : "Read with natural, expressive storytelling variations. ";
  }

  if (settings.styleExaggeration > 50) {
    styleInstruction += "Make the performance highly dramatic and theatrical. ";
  }

  const prompt = `${styleInstruction}
Text to speak: ${text}`;

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

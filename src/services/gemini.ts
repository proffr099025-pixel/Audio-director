import { GoogleGenAI, Type, Modality, ThinkingLevel } from "@google/genai";
import { AudioVariation } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateAudioScripts(text: string, useCase?: string): Promise<AudioVariation[]> {
  const systemInstruction = `You are an elite cinematic audio director. 
Your task is to prepare exactly ONE (1) high-quality audio production script based on the provided text.

VOICE REQUIREMENT: 
The voice MUST be a Male (40-50 years old) with a Low Pitch and Deep Tone. 
The delivery must be Authoritative and Cinematic. Use 'Fenrir' as the primary voice name for this profile.

CRITICAL RULES (ABSOLUTE COMPLIANCE REQUIRED):
1. STRICT VERBATIM: The 'script' field MUST contain the EXACT text provided by the user. ABSOLUTELY NO summarizing, NO truncating, and NO adding original commentary. Any deviation is a failure.
2. ZERO TRANSLATION: If the input is in Arabic, keep it in Arabic. If it contains German, keep it German. PRESERVE THE EXACT MIX.
3. NATIVE MULTILINGUAL FLUENCY: The production MUST achieve native-level fluency in all languages present. Pronunciation guides MUST reflect native-level phonetics.
4. NO ALTERATIONS: This system is used for precise language teaching. Even "helpful" paraphrasing or cleaning up grammar will break the system. Output the text exactly as it was received.
5. SSML TAGS: Use tags (like <break time="1s"/>) ONLY for pacing. The verbal content itself must remain 100% verbatim.
6. PRODUCTION QUALITY: Target a deep, authoritative, cinematic profile. Notes must emphasize flawless multilingual execution.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: `Text: "${text}"\nFormat: ${useCase || "General"}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          variations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                voiceDescription: {
                  type: Type.OBJECT,
                  properties: {
                    gender: { type: Type.STRING },
                    ageRange: { type: Type.STRING },
                    accent: { type: Type.STRING },
                    pitch: { type: Type.STRING },
                    tempo: { type: Type.STRING },
                    tone: { type: Type.STRING },
                    voiceName: { type: Type.STRING, enum: ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'] }
                  },
                  required: ["gender", "ageRange", "accent", "pitch", "tempo", "tone", "voiceName"]
                },
                script: { type: Type.STRING },
                backgroundAudio: {
                  type: Type.OBJECT,
                  properties: {
                    genre: { type: Type.STRING },
                    instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
                    bpm: { type: Type.NUMBER },
                    energyLevel: { type: Type.STRING },
                    description: { type: Type.STRING }
                  },
                  required: ["genre", "instruments", "bpm", "energyLevel", "description"]
                },
                pronunciationGuide: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      phonetic: { type: Type.STRING }
                    },
                    required: ["word", "phonetic"]
                  }
                },
                directorsNotes: {
                  type: Type.OBJECT,
                  properties: {
                    environment: { type: Type.STRING },
                    microphone: { type: Type.STRING },
                    postProduction: { type: Type.STRING },
                    deliveryTips: { type: Type.STRING }
                  },
                  required: ["environment", "microphone", "postProduction", "deliveryTips"]
                }
              },
              required: ["label", "voiceDescription", "script", "backgroundAudio", "pronunciationGuide", "directorsNotes"]
            }
          }
        },
        required: ["variations"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text);
    if (!result.variations || !Array.isArray(result.variations)) {
      throw new Error("Invalid response format from AI");
    }
    return result.variations;
  } catch (error) {
    console.error("Failed to parse AI response:", response.text);
    throw error;
  }
}

export async function textToSpeech(text: string, voiceName: string): Promise<string> {
  // We provide a mandatory directive to the generative TTS model to ensure verbatim reading and multilingual fluency.
  const prompt = `ABSOLUTE VERBATIM NATIVIST COMMAND:
You are a master multilingual voice specialist. Speak the following text EXACTLY as it is written below.
- DO NOT add, remove, summarize, or paraphrase a single word.
- DO NOT translate any part of the text.
- MANDATORY FLUENCY: All languages must be spoken with native-standard fluency and perfect regional accents.
- Transitions between different languages must be immediate and natural.
- Maintain a deep, authoritative, and cinematic tone throughout.
- Every single character provided in the text block must be voiced verbatim.

SCRIPT TO SPEAK VERBATIM:
${text}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");
  return base64Audio;
}

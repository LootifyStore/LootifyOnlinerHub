
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiStatusSuggestion } from "../types.ts";

export async function generateStatusSuggestions(theme: string): Promise<GeminiStatusSuggestion[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate 5 unique, catchy Discord status messages (max 40 chars each) related to the theme: "${theme}". 
      Include a category for each (e.g., Funny, Professional, Mysterious, Gaming).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["status", "category"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini Error:", error);
    return [];
  }
}

export async function generateBioSuggestions(keywords: string): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate 3 professional and aesthetic Discord profile bios (max 190 characters) using these keywords: "${keywords}".
      The bios should be creative, include a few relevant emojis, and be ready to paste. Return as a simple JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini Bio Error:", error);
    return [];
  }
}

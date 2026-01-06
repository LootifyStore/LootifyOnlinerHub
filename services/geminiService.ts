
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiStatusSuggestion } from "../types.ts";

export async function generateStatusSuggestions(theme: string): Promise<GeminiStatusSuggestion[]> {
  // Always initialize right before use to ensure process.env.API_KEY is available
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

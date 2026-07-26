import { GoogleGenAI } from "@google/genai";
try {
  new GoogleGenAI({ apiKey: undefined });
  console.log("No error");
} catch (e) {
  console.error("Error:", e.message);
}

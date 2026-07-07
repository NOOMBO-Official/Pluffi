import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import admin from "firebase-admin";

const getWeatherDeclaration = {
  name: "getWeather",
  description: "Get the weather in a given location using Open-Meteo",
  parameters: {
    type: Type.OBJECT,
    properties: {
      location: {
        type: Type.STRING,
        description: "The city and state, e.g. San Francisco, CA"
      }
    },
    required: ["location"]
  }
};

async function executeGetWeather(location: string) {
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
    const geoData = await geo.json();
    if (!geoData.results || geoData.results.length === 0) return { error: "Location not found." };
    const { latitude, longitude } = geoData.results[0];
    
    const weather = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`);
    const weatherData = await weather.json();
    return weatherData;
  } catch(e) {
    return { error: "Error fetching weather." };
  }
}

// Initialize Firebase Admin SDK if key is provided
let adminInitialized = false;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    adminInitialized = true;
    console.log("Firebase Admin initialized successfully.");
  } catch (e) {
    console.error("Failed to initialize Firebase Admin:", e);
  }
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // In-memory store for QR sessions
  const qrSessions: Record<string, { customToken: string | null; createdAt: number }> = {};

  // API Routes
  app.post("/api/qr-token/create", (req, res) => {
    if (!adminInitialized) return res.status(501).json({ error: "Firebase Admin not configured" });
    const sessionId = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    qrSessions[sessionId] = { customToken: null, createdAt: Date.now() };
    res.json({ sessionId });
  });

  app.post("/api/qr-token/approve", async (req, res) => {
    if (!adminInitialized) return res.status(501).json({ error: "Firebase Admin not configured" });
    const { sessionId, idToken } = req.body;
    if (!qrSessions[sessionId]) return res.status(404).json({ error: "Session not found or expired" });
    
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      const customToken = await admin.auth().createCustomToken(decoded.uid);
      qrSessions[sessionId].customToken = customToken;
      res.json({ success: true });
    } catch(e: any) {
      console.error(e);
      res.status(401).json({ error: "Failed to verify ID token" });
    }
  });

  app.get("/api/qr-token/poll/:sessionId", (req, res) => {
    const session = qrSessions[req.params.sessionId];
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.customToken) {
      const customToken = session.customToken;
      delete qrSessions[req.params.sessionId]; // Clean up
      return res.json({ status: "approved", customToken });
    }
    res.json({ status: "pending" });
  });

  app.post("/api/analyze-item", async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      const extractBase64 = (dataUrl: string) => {
        const [header, data] = dataUrl.split(',');
        return { data, mimeType: header.split(':')[1].split(';')[0] };
      };
      const parsedImage = extractBase64(image);

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { inlineData: { data: parsedImage.data, mimeType: parsedImage.mimeType } },
          { text: "Analyze the clothing item in this image. Return a JSON object with: 'description' (short descriptive name), 'brand' (if obvious, else empty string), 'color', 'category' (must be exactly 'Tops', 'Bottoms', 'Outerwear', or 'Shoes'), 'tags' (array of strings, e.g. formal, casual, winter, summer, y2k, vintage), and 'material' (string description of the material, e.g. 'Cotton', 'Denim', 'Leather', 'Silk', 'Polyester')." }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });
      res.json({ result: response.text });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/outfit/generate", async (req, res) => {
    try {
      const { prompt, items } = req.body;
      const jsonContext = JSON.stringify(items);
      let contents: any[] = [`Given the following wardrobe items: ${jsonContext}. User prompt: "${prompt}". Suggest 1 great outfit by selecting a logical combination of items. Respond strictly in JSON format with an array of the selected item IDs and a short explanation.`];
      
      const config: any = {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }, { functionDeclarations: [getWeatherDeclaration] }],
        toolConfig: { includeServerSideToolInvocations: true },
        systemInstruction: "You are Pluffi, a highly personalized AI closet stylist, acting like an advanced version of Alexa or Siri but solely focused on fashion and styling. You factor in the current live weather, season, latest trending fashion trends at this exact moment, where the user is going, their mood/feeling, personality, and personal style. Analyze these factors deeply using Google Search or the weather tool before selecting the perfect cohesive outfit from their wardrobe items. Ensure your explanation is extremely detailed, fashionable, and empathetic.",
      };

      let response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionResponses = [];
        for (const call of response.functionCalls) {
          if (call.name === 'getWeather') {
            const args = call.args as any;
            const result = await executeGetWeather(args.location);
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: result
              }
            });
          }
        }
        
        contents.push(response.candidates?.[0]?.content);
        contents.push({ parts: functionResponses });
        
        response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents,
          config
        });
      }

      res.json({ result: response.text });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auto-plan", async (req, res) => {
    try {
      const { prompt, items, startDate } = req.body;
      const jsonContext = JSON.stringify(items);
      let contents: any[] = [`Given the following wardrobe items: ${jsonContext}. User prompt: "${prompt}". Start date: ${startDate}. Suggest a schedule of events for the next 7 days, and select a logical combination of items for each event's outfit. Respond strictly in JSON format with an array of events: [{ "date": "YYYY-MM-DD", "title": "...", "outfitDescription": "...", "itemIds": ["..."] }]. Keep it stylish and thematic!`];
      
      const config: any = {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }, { functionDeclarations: [getWeatherDeclaration] }],
        toolConfig: { includeServerSideToolInvocations: true },
        systemInstruction: "You are Pluffi, a highly personalized AI closet stylist. Check the weather forecast using the getWeather tool and the latest trends via Google Search to plan a week of cohesive, trendy outfits for the user. Ensure your explanation is extremely detailed, fashionable, and empathetic.",
      };

      let response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionResponses = [];
        for (const call of response.functionCalls) {
          if (call.name === 'getWeather') {
            const args = call.args as any;
            const result = await executeGetWeather(args.location);
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: result
              }
            });
          }
        }
        
        contents.push(response.candidates?.[0]?.content);
        contents.push({ parts: functionResponses });
        
        response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents,
          config
        });
      }

      res.json({ result: response.text });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/generate-model", async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      let resultUrl = "";

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image',
          contents: {
            parts: [
              { text: "Reference Subject:" },
              {
                inlineData: {
                  data: image, // base64 string without data:mimeType;base64,
                  mimeType: mimeType,
                },
              },
              { text: "A clean high fashion full body sketch or stylish realistic minimalist fashion avatar of this exact person, well-lit, highly detailed, minimalist fashion aesthetic, white background." }
            ]
          },
          config: {
            imageConfig: {
              aspectRatio: "3:4"
            }
          }
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            resultUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
        if (!resultUrl) {
           throw new Error("Failed to generate image.");
        }
      } catch (e: any) {
        console.error("Gemini image generation failed, falling back to Hugging Face:", e.message);
        if (process.env.HF_TOKEN) {
           const { HfInference } = await import("@huggingface/inference");
           const hf = new HfInference(process.env.HF_TOKEN);

           let refinedPrompt = "A clean high fashion full body sketch or stylish realistic minimalist fashion avatar of a person, well-lit, highly detailed, minimalist fashion aesthetic, white background.";
           try {
              const analysisResponse = await ai.models.generateContent({
                 model: 'gemini-2.5-flash',
                 contents: { parts: [
                   { text: "Describe this person exactly (gender, age, hair style/color, ethnicity, facial features)." },
                   { inlineData: { data: image, mimeType: mimeType } },
                   { text: "Output ONLY a single, EXTREMELY rich and highly detailed text-to-image prompt to generate a character illustration. Use evocative, descriptive language. Format: 'A breathtaking, ultra-photorealistic full body shot of [Detailed physical description: age, ethnicity, eye color, hair texture, skin details]. The subject is wearing chic, avant-garde minimalist fashion. Studio photography, dramatic cinematic multi-point lighting, 8k resolution, hyper-detailed, intricate textures, shot on 85mm lens, pristine white background, masterpiece of fashion photography.'" }
                 ]}
              });
              refinedPrompt = analysisResponse.text || refinedPrompt;
           } catch(analyzeErr) {
              console.error("Failed to analyze image for HF fallback, using default", analyzeErr);
           }

           const hfRes = await hf.textToImage({
             model: "black-forest-labs/FLUX.1-dev",
             inputs: refinedPrompt,
             parameters: {
               num_inference_steps: 50,
               guidance_scale: 3.5
             }
           });
           const arrayBuffer = await (hfRes as any).arrayBuffer();
           const base64 = Buffer.from(arrayBuffer).toString('base64');
           resultUrl = `data:image/jpeg;base64,${base64}`;
        } else {
           throw e;
        }
      }

      res.json({ result: resultUrl });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/try-on/generate", async (req, res) => {
    try {
      const { modelImage, outfitImages } = req.body;
      let resultUrl = "";
      
      // Process outfits and remove background
      const processedOutfits = [];
      try {
        const { removeBackground } = await import('@imgly/background-removal-node');
        for (const img of outfitImages) {
          try {
            console.log("Removing background from outfit image...");
            // Convert data URI to Blob
            const [header, data] = img.split(',');
            const mimeType = header.split(':')[1].split(';')[0];
            const buf = Buffer.from(data, 'base64');
            const blobInput = new Blob([buf], { type: mimeType });
            
            const blobOutput = await removeBackground(blobInput);
            const arrayBuffer = await blobOutput.arrayBuffer();
            const resultBuffer = Buffer.from(arrayBuffer);
            processedOutfits.push(`data:image/png;base64,${resultBuffer.toString('base64')}`);
            console.log("Successfully removed background.");
          } catch (e) {
            console.error("BG removal failed, using original", e);
            processedOutfits.push(img);
          }
        }
      } catch (e) {
         console.error("Could not load imgly, using originals", e);
         processedOutfits.push(...outfitImages);
      }
      
      // Parse base64 strings to remove the data URL part
      const extractBase64 = (dataUrl: string) => {
        const [header, data] = dataUrl.split(',');
        return { data, mimeType: header.split(':')[1].split(';')[0] };
      };

      const parsedModel = extractBase64(modelImage);
      const parsedOutfits = processedOutfits.map((img: string) => extractBase64(img));

      const createTryOnPrompt = async () => {
         // Create a text prompt using standard flash first for the detailed description, 
         // which helps the image model drastically.
         let detailedPrompt = "A highly realistic fashion editorial style photo of the subject wearing the exact clothing items. Studio lighting, highly realistic full-body editorial photography.";
         try {
            const analysisResponse = await ai.models.generateContent({
               model: 'gemini-2.5-flash',
               contents: { parts: [
                 { text: "Analyze these images carefully. First is a person (subject). The following images are clothing items." },
                 { inlineData: { data: parsedModel.data, mimeType: parsedModel.mimeType } },
                 ...parsedOutfits.map((img: any) => ({ inlineData: { data: img.data, mimeType: img.mimeType } })),
                 { text: "Write an EXTREMELY rich, photorealistic, and highly detailed prompt for an elite text-to-image model. Describe the person's exact physical features, ethnicity, hair texture, eye color, and body type with forensic precision. Then describe the exact color, texture, fabric weave, cut, and fit of each clothing item they are wearing with haute couture detailing. Do NOT mention that these are reference images. Describe the final scene as a masterpiece of fashion photography. Example: 'A breathtaking, ultra-photorealistic full body fashion editorial portrait of a striking tall woman with voluminous curly mahogany hair and flawless olive skin, wearing a relaxed-fit navy blue striped linen button-down shirt with intricate stitching and distressed light wash denim jeans. Shot in a high-end clean modern studio, cinematic multi-point lighting, dramatic shadows, 8k resolution, shot on 85mm lens, photorealistic, insanely detailed, award-winning Vogue cover.' Output ONLY the prompt." }
               ]}
            });
            detailedPrompt = analysisResponse.text || detailedPrompt;
            console.log("Detailed vision prompt:", detailedPrompt);
         } catch (e) {
            console.error("Failed to generate detailed prompt", e);
         }

         const partsTemplate: any[] = [];
         partsTemplate.push({ text: detailedPrompt });
         partsTemplate.push({ text: "Here is the exact subject to feature:" });
         partsTemplate.push({ inlineData: { data: parsedModel.data, mimeType: parsedModel.mimeType } });
         partsTemplate.push({ text: "Here are the exact clothing items they MUST be wearing:" });
         parsedOutfits.forEach((img: any) => {
            partsTemplate.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
         });
         
         return { partsTemplate, detailedPrompt };
      };

      const { partsTemplate: parts, detailedPrompt } = await createTryOnPrompt();

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image',
          contents: { parts },
          config: {
            imageConfig: { aspectRatio: "3:4" }
          }
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            resultUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
        
        if (!resultUrl) {
           throw new Error("Failed to generate try-on image.");
        }
      } catch (e: any) {
         console.error("Gemini try-on failed, falling back to Hugging Face:", e.message);
         if (process.env.HF_TOKEN) {
            const { HfInference } = await import("@huggingface/inference");
            const hf = new HfInference(process.env.HF_TOKEN);
            
            console.log("Using detailed prompt for HF fallback:", detailedPrompt);
            const hfRes = await hf.textToImage({
               model: "black-forest-labs/FLUX.1-dev",
               inputs: detailedPrompt,
               parameters: {
                 num_inference_steps: 50,
                 guidance_scale: 3.5
               }
            });
            const arrayBuffer = await (hfRes as any).arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            resultUrl = `data:image/jpeg;base64,${base64}`;
         } else {
            throw e;
         }
      }

      res.json({ result: resultUrl });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Setup HTTP Server
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Setup WebSocket Server for Gemini Live API
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (clientWs: WebSocket) => {
    const session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio) {
             clientWs.send(JSON.stringify({ audio }));
          }
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
          if (message.toolCall) {
            const calls = message.toolCall.functionCalls;
            if (calls) {
              const responses: any[] = [];
              for (const call of calls) {
                if (call.name === "showItems") {
                  clientWs.send(JSON.stringify({ showItems: call.args }));
                  responses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: "displayed_to_user" }
                  });
                }
              }
              if (responses.length > 0) {
                 session.sendToolResponse({ functionResponses: responses });
              }
            }
          }
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        tools: [
          { googleSearch: {} },
          {
            functionDeclarations: [
              {
                name: "showItems",
                description: "Show a specific set of wardrobe items or an outfit to the user visually on their screen. Call this when you want to visually present suggested clothes or outfits.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    itemIds: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "List of item IDs to show from the user's wardrobe context."
                    },
                    caption: {
                      type: Type.STRING,
                      description: "A short text phrase describing the look."
                    }
                  },
                  required: ["itemIds"]
                }
              }
            ]
          }
        ],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
        systemInstruction: "You are Pluffi, a highly personalized, vibrant, and enthusiastic AI personal closet stylist. You are like Alexa or Siri, but for fashion. Always match your suggestions to the current weather, season, destination, mood, and aesthetic. You have full awareness of the user's wardrobe items via context messages. When suggesting outfits or searching for specific clothes, you SHOULD use the 'showItems' tool to visually pop them up on the user's screen while you describe them audibly.",
      },
    });

    clientWs.on("message", (data) => {
      const { audio, text } = JSON.parse(data.toString());
      if (audio) {
        session.sendRealtimeInput({
          audio: { data: audio, mimeType: "audio/pcm;rate=16000" }
        });
      }
      if (text) {
        session.sendRealtimeInput({
          text: text
        });
      }
    });

    clientWs.on("close", () => {
      session.close();
    });
  });

  // Vite middlewware for dev, Static files for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();

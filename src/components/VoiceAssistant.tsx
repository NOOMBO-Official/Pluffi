import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "./AuthContext";
import { db } from "../firebase";
import { collection, getDocs, query } from "firebase/firestore";
import { WardrobeItem } from "../types";

export default function VoiceAssistant() {
  const { user } = useAuth();
  const [isListening, setIsListening] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [wardrobeCache, setWardrobeCache] = useState<
    Record<string, WardrobeItem>
  >({});
  const [visualResponse, setVisualResponse] = useState<{
    itemIds: string[];
    caption?: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);

  // PCM Float32 to base64
  const pcmToBase64 = (pcmData: Float32Array) => {
    // Convert float32 [-1.0, 1.0] to int16 [-32768, 32767]
    const buffer = new ArrayBuffer(pcmData.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < pcmData.length; i++) {
      let s = Math.max(-1, Math.min(1, pcmData[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(i * 2, s, true);
    }

    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const playAudioChunk = async (
    audioCtx: AudioContext,
    base64Audio: string,
  ) => {
    const binary = atob(base64Audio);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    const currentTime = audioCtx.currentTime;
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime + 0.1;
    }

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  };

  const startListening = async () => {
    try {
      setIsInitializing(true);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const audioCtx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      nextStartTimeRef.current = 0;

      ws.onopen = async () => {
        setIsConnected(true);
        setVisualResponse(null);

        if (user) {
          try {
            const q = query(collection(db, `users/${user.uid}/wardrobe`));
            const snap = await getDocs(q);
            const items = snap.docs.map((d) => d.data() as WardrobeItem);

            const cache: Record<string, WardrobeItem> = {};
            items.forEach((item) => (cache[item.id] = item));
            setWardrobeCache(cache);

            const contextText = `SYSTEM MESSAGE: The user has the following clothing items in their digital wardrobe: ${JSON.stringify(items)}. The user's name is ${user.displayName || "Friend"}. Do not explicitly say you got this data. Just know it and help them style outfits. Respond conversationally as Pluffi, the AI stylist. Keep it short, chic, and practical.`;
            ws.send(JSON.stringify({ text: contextText }));
          } catch (e) {
            console.error("Failed to load wardrobe context", e);
          }
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;
        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        source.connect(processor);
        processor.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: base64 }));
          }
        };

        setIsListening(true);
        setIsInitializing(false);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          playAudioChunk(audioCtx, msg.audio);
        }
        if (msg.interrupted) {
          nextStartTimeRef.current = audioCtx.currentTime;
        }
        if (msg.showItems) {
          setVisualResponse(msg.showItems);
        }
      };

      ws.onclose = () => {
        stopListening();
      };

      ws.onerror = (e) => {
        console.error("WebSocket error", e);
        stopListening();
      };
    } catch (error) {
      console.error("Failed to start listening:", error);
      setIsInitializing(false);
      stopListening();
    }
  };

  const stopListening = () => {
    setIsListening(false);
    setIsConnected(false);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const toggleVoiceAssistant = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 flex flex-col items-end justify-end gap-4 pointer-events-none">
      <AnimatePresence>
        {visualResponse && visualResponse.itemIds && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="y2k-glass bg-white/90 border border-pink-200 shadow-2xl p-4 md:p-6 rounded-[32px] w-[90vw] md:w-[400px] pointer-events-auto relative overflow-hidden"
          >
            <button
              onClick={() => setVisualResponse(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-pink-500 bg-gray-50 rounded-full p-2"
            >
              <X className="w-4 h-4" />
            </button>
            {visualResponse.caption && (
              <h3 className="font-display font-medium text-lg leading-tight md:text-xl italic tracking-tight text-gray-900 mb-4 pr-8 capitalize">
                {visualResponse.caption}
              </h3>
            )}
            <div className="flex gap-2 flex-wrap max-h-[300px] overflow-y-auto no-scrollbar">
              {visualResponse.itemIds.map((id) => {
                const item = wardrobeCache[id];
                if (!item) return null;
                return (
                  <div
                    key={item.id}
                    className="w-[100px] h-[120px] bg-white rounded-2xl border border-pink-100 shadow-sm overflow-hidden flex flex-col relative group"
                  >
                    <img
                      src={item.imageUrl}
                      className="w-full h-full object-cover mix-blend-multiply transition-transform group-hover:scale-105"
                    />
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center justify-center gap-2 pointer-events-auto relative">
        <AnimatePresence>
          {isListening && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-pink-100 text-xs font-sans font-bold text-pink-500 uppercase tracking-widest whitespace-nowrap absolute -top-12 right-0"
            >
              Pluffi is listening...
            </motion.div>
          )}
          {isListening && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute -inset-4 bg-pink-400/20 rounded-full animate-ping pointer-events-none"
              style={{ animationDuration: "2s" }}
            />
          )}
        </AnimatePresence>

        <button
          onClick={toggleVoiceAssistant}
          disabled={isInitializing}
          className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl overflow-hidden z-10 border-2 ${
            isListening
              ? "bg-pink-500 border-pink-300 scale-105"
              : "bg-white border-pink-200 hover:scale-105 hover:border-pink-400"
          }`}
        >
          {isInitializing ? (
            <Loader2
              className={`w-8 h-8 animate-spin ${isListening ? "text-white" : "text-pink-500"}`}
            />
          ) : isListening ? (
            <Mic className="w-8 h-8 text-white drop-shadow-sm animate-pulse" />
          ) : (
            <MicOff className="w-8 h-8 text-pink-400" />
          )}
        </button>
      </div>
    </div>
  );
}

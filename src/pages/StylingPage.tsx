import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../components/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, doc, setDoc } from 'firebase/firestore';
import { WardrobeItem, Outfit } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Sparkles, Mic, Loader2, Save, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export default function StylingPage() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedOutfit, setGeneratedOutfit] = useState<{items: WardrobeItem[], explanation: string} | null>(null);
  const [stats, setStats] = useState({ items: 0, outfits: 0 });
  const [recentOutfit, setRecentOutfit] = useState<Outfit | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      try {
        const itemsQ = query(collection(db, `users/${user.uid}/wardrobe`));
        const outfitsQ = query(collection(db, `users/${user.uid}/outfits`));
        const [itemsSnap, outfitsSnap] = await Promise.all([getDocs(itemsQ), getDocs(outfitsQ)]);
        setStats({ items: itemsSnap.size, outfits: outfitsSnap.size });
        
        if (!outfitsSnap.empty) {
          const outfitDocs = outfitsSnap.docs.map(doc => doc.data() as Outfit);
          outfitDocs.sort((a, b) => b.createdAt - a.createdAt);
          setRecentOutfit(outfitDocs[0]);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchStats();
  }, [user]);
  
  // Live API State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const generateOutfit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get all wardrobe items
      const q = query(collection(db, `users/${user.uid}/wardrobe`));
      const querySnapshot = await getDocs(q);
      const items = querySnapshot.docs.map(doc => doc.data() as WardrobeItem);
      
      if (items.length === 0) {
        alert("Please add some items to your closet first!");
        setLoading(false);
        return;
      }

      // Minimalistic JSON structure to send to AI
      const minimalItems = items.map(item => ({
        id: item.id,
        category: item.category,
        description: item.description 
      }));

      const finalPrompt = prompt.trim() || "Create a casual, aesthetic fit for today.";

      const response = await fetch('/api/outfit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt, items: minimalItems })
      });

      const rawResult = await response.json();
      
      // Attempt to parse AI response
      let resultData;
      try {
         const cleanJSON = rawResult.result.replace(/```json/g, '').replace(/```/g, '').trim();
         resultData = JSON.parse(cleanJSON);
      } catch (e) {
         console.error("AI return format error:", rawResult.result);
         alert("Oops, Pluffi got confused. Please try again.");
         setLoading(false);
         return;
      }

      // resultData should have { itemIds: [], explanation: "" } (fallback for array)
      const selectedIds = resultData.itemIds || resultData;
      const explanation = resultData.explanation || "Here is an outfit tailored just for you.";
      
      const selectedItems = items.filter(i => Array.isArray(selectedIds) && selectedIds.includes(i.id));

      setGeneratedOutfit({ items: selectedItems, explanation });
      
    } catch (error) {
      console.error(error);
      alert("Failed to generate outfit.");
    } finally {
      setLoading(false);
    }
  };

  const saveOutfit = async () => {
     if (!user || !generatedOutfit) return;
     try {
       const outfitId = crypto.randomUUID();
       const newOutfit: Outfit = {
         id: outfitId,
         userId: user.uid,
         itemIds: generatedOutfit.items.map(i => i.id),
         prompt: prompt,
         explanation: generatedOutfit.explanation,
         createdAt: Date.now()
       };
       await setDoc(doc(db, `users/${user.uid}/outfits`, outfitId), newOutfit);
       alert("Outfit saved to history!");
     } catch (e) {
       handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/outfits`);
     }
  };

  const toggleLive = async () => {
    if (isLiveActive) {
      wsRef.current?.close();
      setIsLiveActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsLiveActive(true);
        source.connect(processor);
        processor.connect(audioContextRef.current!.destination);
      };

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
          wsRef.current.send(JSON.stringify({ audio: base64Audio }));
        }
      };

      wsRef.current.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          const binaryStr = atob(msg.audio);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          // Simple playback
          const audioBuffer = await audioContextRef.current!.decodeAudioData(bytes.buffer);
          const sourceNode = audioContextRef.current!.createBufferSource();
          sourceNode.buffer = audioBuffer;
          sourceNode.connect(audioContextRef.current!.destination);
          sourceNode.start();
        }
      };

      wsRef.current.onclose = () => {
        stream.getTracks().forEach(t => t.stop());
        processor.disconnect();
        source.disconnect();
        setIsLiveActive(false);
      };
      
    } catch (e) {
      alert("Failed to start voice assistant. Please check microphone permissions.");
      console.error(e);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 relative z-10 transition-all duration-300">
        <h2 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight text-white drop-shadow-sm mb-4 capitalize">Welcome to Pluffi.</h2>
        <p className="text-white/90 font-sans font-medium px-8 py-3 rounded-full text-sm max-w-sm mb-6">Sign in to meet your personal AI stylist.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col items-start w-full relative z-10 animate-in fade-in duration-500">
      
      {/* Welcome Header */}
      {!generatedOutfit && (
        <div className="w-full mb-8 ml-2">
          <h1 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight mb-2 text-white drop-shadow-sm capitalize">Welcome back.</h1>
          <p className="text-white/90 font-sans font-medium text-sm md:text-base mb-8 max-w-md">Your personal AI wardrobe is ready. Let's build your style today.</p>
        </div>
      )}

      {/* Camera Live View Panel */}
      {isLiveActive && (
         <div className="w-full mb-8 y2k-glass p-4 rounded-[32px] animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between mb-4 px-4">
              <span className="text-sm font-display font-bold text-gray-700 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live Talk Mode</span>
              <Button variant="ghost" size="sm" onClick={toggleLive} className="text-gray-500 rounded-full">Close</Button>
            </div>
            <div className="w-full aspect-video rounded-3xl overflow-hidden bg-white/20 relative flex items-center justify-center">
               <div className="w-24 h-24 rounded-full bg-white/40 animate-ping absolute"></div>
               <Mic className="w-12 h-12 text-pink-500 relative z-10" />
            </div>
         </div>
      )}

      {!generatedOutfit ? (
        <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10">
           
           {/* Need Styling Advice Card */}
            <div className="md:col-span-8 duo-card p-6 md:p-10 flex flex-col items-start justify-between min-h-[300px]">
              <div>
                <div className="bg-yellow-100/80 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
                  <Sparkles className="w-6 h-6 text-yellow-600" />
                </div>
                <h2 className="text-2xl md:text-3xl font-display italic font-medium tracking-tight text-gray-900 mb-2">Need styling advice?</h2>
                <p className="text-gray-500 font-sans text-sm max-w-sm mb-8 leading-relaxed font-medium">Ask Pluffi to put together an outfit for your next event or weather condition.</p>
              </div>

              <div className="w-full flex">
                <Button 
                   onClick={() => setPrompt("Create a casual, aesthetic fit for today.")} 
                   className="y2k-btn-primary w-full sm:w-auto px-8 h-12 flex items-center gap-2 text-sm"
                >
                   TALK TO PLUFFI <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
           </div>

            {/* Side Action Cards */}
            <div className="md:col-span-4 flex flex-col gap-6">
               <div className="duo-card p-6 flex flex-col justify-between flex-1">
                 <h3 className="font-display italic font-medium text-gray-900 text-lg mb-1">Digital Closet</h3>
                 <p className="text-[10px] font-display font-medium text-gray-400 uppercase tracking-widest mb-6">OVERVIEW</p>
                 
                 <div className="flex gap-4 mb-6">
                   <div className="bg-pink-50 rounded-2xl p-4 flex-1">
                     <div className="text-2xl font-display italic font-medium text-gray-900 mb-1">{stats.items}</div>
                     <div className="text-[9px] font-display font-bold uppercase tracking-widest text-pink-800">ITEMS</div>
                   </div>
                   <div className="bg-yellow-50 rounded-2xl p-4 flex-1">
                     <div className="text-2xl font-display italic font-medium text-gray-900 mb-1">{stats.outfits}</div>
                     <div className="text-[9px] font-display font-bold uppercase tracking-widest text-yellow-800">OUTFITS</div>
                   </div>
                 </div>

                 <Button className="y2k-btn-secondary w-full text-xs">MANAGE</Button>
               </div>
            </div>

            {/* Custom Input area */}
            <div className="md:col-span-12 y2k-glass p-2 pl-6 pr-2 rounded-full flex items-center gap-4 mt-2 shadow-sm border border-white/60">
               <input 
                  className="bg-transparent flex-1 focus:outline-none font-sans text-gray-700 placeholder:text-gray-400 font-medium"
                  placeholder="Or tell Pluffi exactly what you need..." 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generateOutfit()}
               />
               <Button onClick={generateOutfit} disabled={loading} className="y2k-btn-primary rounded-full h-10 w-10 p-0 flex items-center justify-center shrink-0 shadow-none">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin text-green-800" /> : <Sparkles className="w-4 h-4 text-green-800" />}
               </Button>
               <Button onClick={toggleLive} className="y2k-btn-secondary rounded-full h-10 w-10 p-0 flex items-center justify-center shrink-0 shadow-none">
                  <Mic className="w-4 h-4 text-blue-800" />
               </Button>
            </div>
            
        </div>
      ) : (
         <div className="flex-1 overflow-y-auto no-scrollbar w-full z-10 pb-12 mt-4 animate-in fade-in duration-500">
            <h2 className="text-3xl font-display italic font-medium tracking-tight text-white drop-shadow-sm mb-6 capitalize">Pluffi's Styled Pick</h2>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* AI Interaction Area */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                <div className="duo-card p-8 flex-1 flex flex-col justify-between relative overflow-hidden bg-white">
                  <div className="relative z-10">
                    <p className="text-lg md:text-xl leading-relaxed text-gray-700 font-sans mb-8">"{generatedOutfit.explanation}"</p>
                  </div>
                  <div className="mt-auto flex justify-start relative z-10 w-full gap-4">
                     <Button onClick={() => setGeneratedOutfit(null)} variant="outline" className="rounded-full border-2 border-gray-200 text-gray-600 h-10 px-6 hover:bg-gray-50 flex-1 font-sans font-bold">
                        Try Again
                     </Button>
                     <Button onClick={saveOutfit} className="y2k-btn-primary h-10 px-6 flex-1 text-sm shadow-none">
                        Save Outfit
                     </Button>
                  </div>
                </div>
              </div>

                {/* Visual Layout Area */}
                <div className="lg:col-span-7 duo-card p-8 relative overflow-hidden bg-white/60">
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4 relative z-10">
                    {generatedOutfit.items.map((item: any, idx: number) => (
                      <div key={item.id} className="bg-white rounded-3xl p-3 aspect-[3/4] shadow-sm transform hover:-translate-y-1 transition-transform cursor-pointer relative overflow-hidden group">
                         <div className="w-full h-full bg-gray-50 rounded-2xl relative overflow-hidden">
                           <img src={item.imageUrl} alt={item.category} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                         </div>
                      </div>
                    ))}
                 </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}

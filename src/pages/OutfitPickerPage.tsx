import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { WardrobeItem } from '../types';
import { Sparkles, Loader2, ChevronLeft, ChevronRight, User, Share2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export default function OutfitPickerPage() {
  const { user } = useAuth();
  const [modelImage, setModelImage] = useState<string | null>(null);
  const [wardrobe, setWardrobe] = useState<Record<string, WardrobeItem[]>>({});
  const [tryOnImage, setTryOnImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isAutoStyling, setIsAutoStyling] = useState(false);

  // Indexes for cycling
  const [selections, setSelections] = useState<Record<string, number>>({
    Tops: 0,
    Bottoms: 0,
    Shoes: 0,
    Outerwear: 0
  });

  const categories = ['Tops', 'Bottoms', 'Outerwear', 'Shoes'];

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Fetch model
      const docRef = doc(db, `users/${user.uid}/model/latest`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setModelImage(docSnap.data().imageUrl);
      }

      // Fetch wardrobe
      const wardrobeDocs = await getDocs(query(collection(db, `users/${user.uid}/wardrobe`)));
      const items = wardrobeDocs.docs.map(d => d.data() as WardrobeItem);
      
      const grouped: Record<string, WardrobeItem[]> = {};
      items.forEach(item => {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
      });
      setWardrobe(grouped);
      
      // Reset tryon
      setTryOnImage(null);
    };
    fetchData();
  }, [user]);

  const cycleItem = (category: string, direction: number) => {
    setSelections(prev => {
      const current = prev[category] || 0;
      const categoryItems = wardrobe[category] || [];
      if (categoryItems.length === 0) return prev;
      
      let next = current + direction;
      if (next < 0) next = categoryItems.length - 1;
      if (next >= categoryItems.length) next = 0;
      
      return { ...prev, [category]: next };
    });
    setTryOnImage(null); // Reset visualization when changing items
  };

  const handleTryOn = async () => {
    if (!modelImage) return;
    
    setIsLoading(true);
    try {
      const selectedImageUrls = categories
        .map(cat => wardrobe[cat]?.[selections[cat]]?.imageUrl)
        .filter(Boolean) as string[];

      if (selectedImageUrls.length === 0) {
          alert('Please select at least one item');
          setIsLoading(false);
          return;
      }

      const response = await fetch('/api/try-on/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          modelImage, 
          outfitImages: selectedImageUrls 
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setTryOnImage(data.result);
    } catch (e) {
      console.error(e);
      alert("Failed to generate try-on. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoStyle = async () => {
    if (!prompt) return;
    setIsAutoStyling(true);
    try {
      const allItems = Object.values(wardrobe).flat();
      const response = await fetch('/api/outfit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, items: allItems })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      let resultStr = data.result;
      if (resultStr.startsWith('```json')) {
        resultStr = resultStr.replace(/```json\n/, '').replace(/\n```/, '');
      }

      const parsed = JSON.parse(resultStr);
      const selectedIds = Array.isArray(parsed) ? parsed : (parsed.itemIds || []);

      // Update selections
      setSelections(prev => {
        const next = { ...prev };
        categories.forEach(cat => {
          const itemsCat = wardrobe[cat] || [];
          const foundIdx = itemsCat.findIndex(item => selectedIds.includes(item.id));
          if (foundIdx !== -1) {
            next[cat] = foundIdx;
          }
        });
        return next;
     });
     setTryOnImage(null);
    } catch(e) {
      console.error(e);
      alert('Failed to auto-style outfit');
    } finally {
      setIsAutoStyling(false);
    }
  };

  const handleShare = async () => {
    if (!tryOnImage) return;
    try {
      const res = await fetch(tryOnImage);
      const blob = await res.blob();
      const file = new File([blob], 'minimodelme-look.jpg', { type: 'image/jpeg' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My MiniModelMe™ Look',
          text: 'Check out the outfit I styled on MiniModelMe™!'
        });
      } else {
        // Fallback download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'minimodelme-look.jpg';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Error sharing:', e);
      if (tryOnImage.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = tryOnImage;
        a.download = 'minimodelme-look.jpg';
        a.click();
      }
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 relative z-10 transition-all duration-300">
        <h2 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight text-white drop-shadow-sm mb-4 capitalize">Outfit Picker</h2>
        <p className="text-white/90 font-sans font-medium px-8 py-3 rounded-full text-sm max-w-sm mb-6">Sign in to use the Clueless-style outfit picker.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 w-full mx-auto h-full flex flex-col pt-8 relative z-10 pb-24 overflow-y-auto no-scrollbar animate-in fade-in">
       <div className="mb-8 text-center">
          <h1 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight mb-2 text-white drop-shadow-sm capitalize">Picker</h1>
          <p className="text-white/90 font-sans font-medium text-sm md:text-base mx-auto max-w-md">Cycle through your closet and try it on your MiniMe.</p>
       </div>

       <div className="flex flex-col lg:flex-row gap-8 items-start w-full mx-auto justify-center relative mt-4 max-w-[1400px]">
          
          {/* Center Column: Outfit Picker (Clueless style) */}
          <div className="w-full flex flex-col gap-4 max-w-[500px] z-10 mx-auto lg:mx-0 lg:ml-[15%]">
             <div className="flex justify-between items-center mb-2">
                <h3 className="font-display italic font-medium text-white drop-shadow-sm text-2xl text-center w-full">Build Your Look</h3>
             </div>
             
             <div className="duo-card p-6 md:p-8 flex flex-col gap-6 border-none bg-white/60 relative shadow-xl backdrop-blur-xl">
                 <div className="flex gap-2 mb-2 p-2 bg-white/50 rounded-[28px] border border-pink-100 shadow-inner">
                    <Input 
                      value={prompt} 
                      onChange={e => setPrompt(e.target.value)} 
                      placeholder="e.g. going to a summer beach party" 
                      className="bg-transparent border-none shadow-none h-12 flex-1 focus-visible:ring-0 px-4 font-sans text-sm"
                    />
                    <Button 
                      onClick={handleAutoStyle} 
                      disabled={isAutoStyling || !prompt} 
                      className="rounded-full h-12 w-12 p-0 flex shrink-0 items-center justify-center y2k-btn-primary shadow-sm"
                    >
                      {isAutoStyling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    </Button>
                 </div>

                {categories.map(category => {
                   const items = wardrobe[category] || [];
                   const selectedIndex = selections[category] || 0;
                   const selectedItem = items[selectedIndex];

                   return (
                     <div key={category} className="flex flex-col gap-2">
                        <div className="flex justify-between items-center px-1">
                           <span className="text-xs font-sans font-bold uppercase tracking-widest text-[#ff71ce]">{category}</span>
                           <span className="text-[10px] text-gray-500 font-bold">{items.length > 0 ? `${selectedIndex + 1} / ${items.length}` : 'Empty'}</span>
                        </div>
                        
                        <div className="flex items-center gap-4 bg-white rounded-3xl p-3 border-2 border-transparent hover:border-pink-200 transition-colors shadow-sm">
                           <button 
                             onClick={() => cycleItem(category, -1)}
                             className="p-3 bg-pink-50 hover:bg-pink-100 rounded-full text-pink-400 hover:text-pink-600 transition-colors shadow-sm"
                             disabled={items.length <= 1}
                           >
                              <ChevronLeft className="w-6 h-6" />
                           </button>
                           
                           <div className="flex-1 h-36 relative flex items-center justify-center overflow-hidden">
                              {selectedItem ? (
                                <img src={selectedItem.imageUrl} alt={selectedItem.description} className="absolute inset-0 w-full h-full object-contain mx-auto mix-blend-multiply drop-shadow-sm p-2 transform hover:scale-105 transition-transform" />
                              ) : (
                                <div className="text-center text-gray-400 font-sans font-bold text-xs uppercase tracking-widest bg-gray-50 w-full h-full flex items-center justify-center rounded-2xl">
                                   No Items
                                </div>
                              )}
                           </div>
                           
                           <button 
                             onClick={() => cycleItem(category, 1)}
                             className="p-3 bg-pink-50 hover:bg-pink-100 rounded-full text-pink-400 hover:text-pink-600 transition-colors shadow-sm"
                             disabled={items.length <= 1}
                           >
                              <ChevronRight className="w-6 h-6" />
                           </button>
                        </div>
                     </div>
                   );
                })}
             </div>

             <Button onClick={handleTryOn} disabled={!modelImage || isLoading} className="h-16 w-full rounded-full y2k-btn-primary shadow-lg flex items-center justify-center gap-2 mt-4 text-base font-bold tracking-widest uppercase">
                 {isLoading ? <Loader2 className="w-6 h-6 animate-spin"/> : <Sparkles className="w-6 h-6" />}
                 {isLoading ? "Visualizing..." : !modelImage ? "Create Model First" : "Visualize On Model"}
             </Button>
          </div>

          {/* Floating Right Canvas: Model / Try On Result */}
           {(tryOnImage || isLoading) && (
            <div className="w-full lg:max-w-[400px] flex flex-col gap-4 lg:absolute lg:right-8 xl:right-16 lg:top-[-40px] z-20 pointer-events-auto animate-in fade-in slide-in-from-right-8 duration-500">
              <h3 className="font-display italic font-medium text-white drop-shadow-sm text-xl lg:text-right hidden lg:block mr-4">Preview</h3>
              <div className="duo-card p-4 flex flex-col items-center justify-center text-center relative overflow-hidden aspect-[3/4] w-full max-w-[420px] mx-auto bg-white/40 backdrop-blur-md border border-white/40 shadow-2xl transition-all duration-300 transform lg:rotate-2 hover:rotate-0 origin-bottom-right group">
                 {tryOnImage ? (
                    <div className="w-full h-full rounded-[28px] overflow-hidden relative shadow-inner bg-white animate-in zoom-in-95 duration-500">
                      <img src={tryOnImage} alt="Try On Result" className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute top-4 right-4 bg-pink-500/90 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full z-10 flex items-center gap-2 shadow-lg">
                         <Sparkles className="w-4 h-4" /> Try On Active
                      </div>
                    </div>
                 ) : modelImage ? (
                    <div className="w-full h-full rounded-[28px] overflow-hidden relative shadow-inner transition-all duration-500 bg-white">
                      <img src={modelImage} alt="Model" className="absolute inset-0 w-full h-full object-cover" />
                    </div>
                 ) : null}
                 
                 {isLoading && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-20 flex flex-col items-center justify-center animate-in fade-in rounded-[32px]">
                       <Loader2 className="w-14 h-14 text-[#ff71ce] animate-spin mb-4" />
                       <p className="font-display italic font-medium text-gray-800 text-xl capitalize">dressing minime...</p>
                    </div>
                 )}

                 {tryOnImage && !isLoading && (
                   <button 
                     onClick={handleShare}
                     className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md text-pink-500 font-bold uppercase tracking-widest text-xs px-6 py-3 rounded-full shadow-xl flex items-center gap-2 opacity-0 group-hover:opacity-100 hover:scale-105 transition-all outline-none border border-pink-100"
                   >
                     <Share2 className="w-4 h-4" /> Share Look
                   </button>
                 )}
              </div>
            </div>
          )}

       </div>
    </div>
  );
}

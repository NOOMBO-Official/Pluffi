import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { Button } from '../components/ui/button';
import { Camera, RefreshCw, Sparkles, User, Image as ImageIcon } from 'lucide-react';
import { resizeImage } from '../lib/image-utils';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function MiniMePage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modelImage, setModelImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchModel = async () => {
      const docRef = doc(db, `users/${user.uid}/model/latest`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setModelImage(docSnap.data().imageUrl);
      }
    };
    fetchModel();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  };

  const handleGenerateModel = async () => {
    if (!file) return;
    setIsGenerating(true);
    try {
      const base64Str = await resizeImage(file);
      
      // Save directly to firestore
      if (user) {
        await setDoc(doc(db, `users/${user.uid}/model/latest`), {
          imageUrl: base64Str,
          updatedAt: Date.now()
        });
      }
      
      setModelImage(base64Str);
      setFile(null); // Clear file to show they are done
      setPreviewUrl(null);
    } catch (error) {
       console.error("Failed to save model", error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 relative z-10 transition-all duration-300">
        <h2 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight text-white drop-shadow-sm mb-4 capitalize">MiniModelMe™</h2>
        <p className="text-white/90 font-sans font-medium px-8 py-3 rounded-full text-sm max-w-sm mb-6">Sign in to create your virtual try-on model.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col pt-8 relative z-10 pb-24 overflow-y-auto no-scrollbar animate-in fade-in">
       <div className="mb-10 ml-2">
          <h1 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight mb-2 text-white drop-shadow-sm capitalize">MiniModelMe™</h1>
          <p className="text-white/90 font-sans font-medium text-sm md:text-base mb-8 max-w-md">Upload a full body picture to act as your model base for the virtual try-on.</p>
       </div>

       <div className="flex flex-col md:flex-row gap-8 lg:gap-12 items-start w-full mx-auto">
          {/* Upload Section */}
          <div className="flex-1 w-full flex flex-col gap-6">
             <div className="duo-card p-2 flex flex-col items-center justify-center text-center relative overflow-hidden aspect-[3/4] w-full max-w-md mx-auto border-none">
               {previewUrl ? (
                  <div className="w-full h-full rounded-[28px] overflow-hidden relative">
                    <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent flex justify-center">
                       <label className="cursor-pointer y2k-btn-secondary px-6 py-2 text-xs font-sans font-bold w-full max-w-[200px] text-center hover:bg-white shadow-sm border-none">
                          Change Photo
                          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                       </label>
                    </div>
                  </div>
               ) : (
                   <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white rounded-[28px] w-full h-full bg-white/40 hover:bg-white/60 transition-colors group">
                     <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-6 text-pink-500 group-hover:scale-105 transition-transform shadow-sm">
                        <ImageIcon className="w-8 h-8" />
                     </div>
                     <p className="font-display italic font-medium text-xl text-gray-800 mb-2 capitalize">full body photo.</p>
                     <p className="text-xs font-sans font-medium text-gray-500 mb-8 px-4">Upload a photo of yourself standing straight in good lighting.</p>
                     <div className="flex gap-4 w-full justify-center">
                        <label className="cursor-pointer y2k-btn-primary px-4 py-3 text-xs w-full max-w-[120px] text-center shadow-none flex items-center justify-center gap-2">
                           <ImageIcon className="w-4 h-4" /> Library
                           <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                        </label>
                        <label className="cursor-pointer y2k-btn-primary px-4 py-3 text-xs w-full max-w-[120px] text-center shadow-none flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600! border-b-blue-700!">
                           <Camera className="w-4 h-4" /> Camera
                           <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
                        </label>
                     </div>
                   </div>
               )}
            </div>
          </div>

          <div className="hidden md:flex flex-col justify-center items-center h-full pt-48 shrink-0 px-2 lg:px-6">
             <Button onClick={handleGenerateModel} disabled={!file || isGenerating} className="h-20 w-20 rounded-full y2k-btn-primary disabled:opacity-50 z-20 flex items-center justify-center p-0 shadow-none hover:scale-105 transform">
                {isGenerating ? <RefreshCw className="w-8 h-8 animate-spin text-white" /> : <Camera className="w-10 h-10 text-white" />}
             </Button>
          </div>

          <div className="flex md:hidden justify-center w-full my-2">
             <Button onClick={handleGenerateModel} disabled={!file || isGenerating} className="h-14 w-full max-w-sm rounded-full y2k-btn-primary text-sm shadow-none">
                {isGenerating ? "Saving..." : "Save Model"}
             </Button>
          </div>

           {/* Result Section */}
           <div className="flex-1 w-full flex flex-col gap-6">
             <div className="duo-card p-2 flex flex-col items-center justify-center text-center relative overflow-hidden aspect-[3/4] w-full max-w-md mx-auto border-none">
               {modelImage ? (
                  <div className="w-full h-full rounded-[28px] overflow-hidden relative shadow-sm bg-white">
                    <img src={modelImage} alt="Generated Model" className="absolute inset-0 w-full h-full object-cover" />
                  </div>
               ) : (
                  <div className="flex flex-col items-center justify-center p-8 w-full h-full bg-white/40 rounded-[28px] border border-white/40">
                     <div className="w-16 h-16 rounded-full bg-white/60 flex items-center justify-center mb-6 shadow-sm">
                       <User className="w-8 h-8 text-pink-300" />
                     </div>
                     <p className="text-xl font-display italic font-medium capitalize text-gray-400 mb-2">your model.</p>
                     <p className="text-xs font-sans font-medium text-gray-400 max-w-[200px]">Will appear here after processing your photo.</p>
                  </div>
               )}
            </div>
          </div>
       </div>
    </div>
  );
}

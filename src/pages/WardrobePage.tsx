import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { WardrobeItem } from '../types';
import { Plus, Trash2, LayoutGrid, UploadCloud, Camera, Search, Tag } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { resizeImage } from '../lib/image-utils';

export default function WardrobePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const [category, setCategory] = useState("Tops");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState("all");

  const availableTags = ['seasonal', 'formal', 'favorite', 'casual', 'work'];

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, `users/${user.uid}/wardrobe`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => doc.data() as WardrobeItem);
      fetchedItems.sort((a, b) => b.createdAt - a.createdAt);
      setItems(fetchedItems);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/wardrobe`);
    });

    return unsubscribe;
  }, [user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    if(selected) {
      setPreviewFileUrl(URL.createObjectURL(selected));
    } else {
      setPreviewFileUrl(null);
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const handleAnalyze = async () => {
    if (!previewFileUrl || !file) return;
    setIsAnalyzing(true);
    try {
      const base64Image = await resizeImage(file);
      const res = await fetch('/api/analyze-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, mimeType: file.type || 'image/jpeg' })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // It returns markdown block possibly, or raw JSON
      let resultStr = data.result;
      if (resultStr.startsWith('```json')) {
        resultStr = resultStr.replace(/```json\n/, '').replace(/\n```/, '');
      }

      const parsed = JSON.parse(resultStr);
      if (parsed.category) setCategory(parsed.category);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.brand) setBrand(parsed.brand);
      if (parsed.color) setColor(parsed.color);
      if (parsed.material) setMaterial(parsed.material);
      if (parsed.tags) {
        // Only keep tags that are in availableTags, or add them? It's fine to add them as new custom tags actually
        setTags(prev => Array.from(new Set([...prev, ...parsed.tags])));
      }
    } catch(e) {
      console.error(e);
      alert('Failed to analyze item');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpload = async () => {
    if (!user || !file) return;
    setIsUploading(true);

    try {
      const base64Image = await resizeImage(file);
      const itemId = crypto.randomUUID();
      const newItem: WardrobeItem = {
        id: itemId,
        userId: user.uid,
        imageUrl: base64Image,
        category,
        description,
        color,
        material,
        brand,
        size,
        tags,
        createdAt: Date.now()
      };

      await setDoc(doc(db, `users/${user.uid}/wardrobe`, itemId), newItem);
      setIsDialogOpen(false);
      setFile(null);
      setPreviewFileUrl(null);
      setDescription("");
      setColor("");
      setMaterial("");
      setBrand("");
      setSize("");
      setTags([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/wardrobe`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/wardrobe`, itemId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/wardrobe/${itemId}`);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 relative z-10 transition-all duration-300">
        <h2 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight text-white drop-shadow-sm mb-4 capitalize">digital closet.</h2>
        <p className="text-gray-600 font-sans font-medium px-8 py-3 rounded-full text-sm max-w-sm mb-6">Sign in to start digitizing your closet.</p>
      </div>
    );
  }

  const filteredItems = items.filter(item => {
    const matchesSearch = item.description?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.brand?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = activeTagFilter === 'all' || (item.tags && item.tags.includes(activeTagFilter));
    return matchesSearch && matchesTag;
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col relative z-10 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6 gap-4 ml-2">
        <h1 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight text-white drop-shadow-sm capitalize">digital closet.</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger render={<Button className="y2k-btn-primary px-6 h-12 flex items-center gap-2 shadow-none"/>}>
              <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Add Item</span>
          </DialogTrigger>
          <DialogContent className="y2k-card p-6 md:p-8 border-none w-[95vw] md:max-w-md max-h-[85vh] overflow-y-auto no-scrollbar">
            <DialogHeader className="mb-4">
              <DialogTitle className="font-display italic font-medium text-2xl tracking-tight text-gray-900 capitalize">add new item.</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-6">
              
              {/* Image Input UI */}
              <div className="w-full aspect-square md:aspect-video rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center relative overflow-hidden group">
                 {previewFileUrl ? (
                    <img src={previewFileUrl} alt="Preview" className="absolute inset-0 w-full h-full object-contain mix-blend-multiply" />
                 ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                       <UploadCloud className="w-8 h-8" />
                       <span className="font-sans font-medium text-sm">Upload or capture</span>
                    </div>
                 )}
                 <div className={`absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center gap-4 transition-opacity ${previewFileUrl ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                    <label className="cursor-pointer flex flex-col items-center gap-2">
                       <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 hover:scale-105 transition-transform"><UploadCloud className="w-5 h-5" /></div>
                       <span className="text-[10px] font-display font-medium text-gray-600 uppercase tracking-widest">Library</span>
                       <Input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                    </label>
                    <label className="cursor-pointer flex flex-col items-center gap-2">
                       <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 hover:scale-105 transition-transform"><Camera className="w-5 h-5" /></div>
                       <span className="text-[10px] font-display font-medium text-gray-600 uppercase tracking-widest">Camera</span>
                       <Input type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
                    </label>
                 </div>
                 
                 {previewFileUrl && (
                   <button 
                     onClick={handleAnalyze} 
                     disabled={isAnalyzing}
                     className="absolute bottom-4 left-1/2 -translate-x-1/2 y2k-btn-primary px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-full z-20 flex items-center gap-2 shadow-lg hover:scale-105 transition-all w-max"
                   >
                     {isAnalyzing ? <span className="animate-spin text-sm">✨</span> : <span className="text-sm">✨</span>}
                     {isAnalyzing ? "Analyzing..." : "AI Auto-Tag"}
                   </button>
                 )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="category" className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 ml-2">Category</Label>
                <select
                  id="category"
                  className="flex h-12 w-full items-center justify-between rounded-2xl bg-gray-50 px-4 text-sm font-sans font-medium text-gray-700 focus:outline-none focus:ring-2 ring-pink-200 cursor-pointer border-none"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Tops">Tops</option>
                  <option value="Bottoms">Bottoms</option>
                  <option value="Shoes">Shoes</option>
                  <option value="Outerwear">Outerwear</option>
                  <option value="Accessories">Accessories</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="desc" className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 ml-2">Description</Label>
                <Input id="desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. White ribbed tank top" className="bg-gray-50 border-none rounded-2xl h-12 px-4 font-sans text-sm focus:ring-2 ring-pink-200 shadow-none!" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="color" className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 ml-2">Color</Label>
                  <Input id="color" value={color} onChange={e => setColor(e.target.value)} placeholder="e.g. White" className="bg-gray-50 border-none rounded-2xl h-12 px-4 font-sans text-sm focus:ring-2 ring-pink-200 shadow-none!" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="material" className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 ml-2">Material</Label>
                  <Input id="material" value={material} onChange={e => setMaterial(e.target.value)} placeholder="e.g. Cotton" className="bg-gray-50 border-none rounded-2xl h-12 px-4 font-sans text-sm focus:ring-2 ring-pink-200 shadow-none!" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="brand" className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 ml-2">Brand</Label>
                  <Input id="brand" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Zara" className="bg-gray-50 border-none rounded-2xl h-12 px-4 font-sans text-sm focus:ring-2 ring-pink-200 shadow-none!" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="size" className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 ml-2">Size</Label>
                  <Input id="size" value={size} onChange={e => setSize(e.target.value)} placeholder="e.g. M" className="bg-gray-50 border-none rounded-2xl h-12 px-4 font-sans text-sm focus:ring-2 ring-pink-200 shadow-none!" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                 <Label className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 ml-2">Tags (Optional)</Label>
                 <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => (
                       <button
                         key={tag}
                         type="button"
                         onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                         className={`px-4 py-2 rounded-full text-xs font-sans font-medium transition-colors border ${tags.includes(tag) ? 'bg-pink-100 text-pink-600 border-pink-200' : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100'}`}
                       >
                         {tag}
                       </button>
                    ))}
                 </div>
              </div>

              <Button onClick={handleUpload} disabled={!file || isUploading} className="mt-2 y2k-btn-primary h-12 w-full text-sm shadow-none">
                {isUploading ? "Uploading..." : "Save to Closet"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search brand or description..." 
            className="pl-10 bg-white/80 backdrop-blur-md border border-white/40 shadow-sm rounded-full h-12 font-sans"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center overflow-x-auto no-scrollbar pb-2 md:pb-0">
           <button
             onClick={() => setActiveTagFilter('all')}
             className={`px-4 py-2 rounded-full text-xs font-sans font-bold transition-all whitespace-nowrap ${activeTagFilter === 'all' ? 'bg-white text-pink-600 shadow-sm' : 'bg-white/40 text-gray-600 hover:bg-white/60'}`}
           >
             All Items
           </button>
           {availableTags.map(tag => (
             <button
               key={tag}
               onClick={() => setActiveTagFilter(tag)}
               className={`px-4 py-2 rounded-full text-xs font-sans font-bold transition-all whitespace-nowrap flex items-center gap-1 ${activeTagFilter === tag ? 'bg-white text-pink-600 shadow-sm' : 'bg-white/40 text-gray-600 hover:bg-white/60'}`}
             >
               <Tag className="w-3 h-3" /> {tag}
             </button>
           ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><p className="font-display font-medium text-xl text-gray-400 drop-shadow-sm capitalize">Loading closet...</p></div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center y2k-card p-12 m-4 bg-white/60 border-dashed border-2 border-white">
          <p className="text-gray-500 font-sans mb-6 text-sm">No items found matching your filters.</p>
          <Button onClick={() => setIsDialogOpen(true)} className="y2k-btn-secondary px-8 h-10 text-xs shadow-none border-none">Start Adding Items</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6 overflow-y-auto no-scrollbar pb-16 px-2">
          {filteredItems.map(item => (
            <div key={item.id} className="group relative duo-card p-3 flex flex-col justify-between">
              <div className="w-full relative rounded-2xl overflow-hidden mb-3 bg-white aspect-[3/4]">
                 <img src={item.imageUrl} alt={item.description} className="absolute inset-0 w-full h-full object-contain object-center group-hover:scale-105 transition-transform duration-500 mix-blend-multiply p-2" />
              </div>
              <div className="px-1 flex flex-col gap-1">
                 <div className="flex justify-between items-center">
                   <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-[#ff71ce]">
                      {item.category}
                   </span>
                   {item.size && <span className="text-[9px] font-sans font-bold bg-gray-100 px-2 py-0.5 rounded-md text-gray-500">{item.size}</span>}
                 </div>
                 <p className="text-gray-800 text-sm font-sans font-bold line-clamp-1">{item.description || "—"}</p>
                 <div className="flex gap-2 text-[10px] text-gray-500 font-sans font-medium">
                    {item.color && <span>{item.color}</span>}
                    {item.color && item.material && <span>•</span>}
                    {item.material && <span>{item.material}</span>}
                 </div>
                 <div className="flex gap-2 text-[10px] text-gray-400 font-sans font-medium">
                    {item.brand && <span>{item.brand}</span>}
                 </div>
                 {item.tags && item.tags.length > 0 && (
                   <div className="flex gap-1 mt-1 overflow-hidden">
                     {item.tags.map(tag => (
                       <span key={tag} className="text-[8px] uppercase tracking-widest bg-pink-50 text-pink-500 px-1.5 py-0.5 rounded-sm line-clamp-1 truncate">{tag}</span>
                     ))}
                   </div>
                 )}
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                className="absolute top-4 right-4 z-30 p-2 text-white bg-black/20 hover:bg-red-400 backdrop-blur-md rounded-full opacity-0 group-hover:opacity-100 transition-all outline-none"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

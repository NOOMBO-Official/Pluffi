import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { db } from '../firebase';
import { collection, query, onSnapshot, getDocs, doc, setDoc } from 'firebase/firestore';
import { CalendarEvent, Outfit, WardrobeItem } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import { format } from 'date-fns';
import { Button } from '../components/ui/button';
import { CalendarIcon, Sparkles, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function CalendarPage() {
  const { user } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [outfits, setOutfits] = useState<(Outfit & { itemsDetails: WardrobeItem[] })[]>([]);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  
  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedOutfitId, setSelectedOutfitId] = useState<string>("");

  const [isAutoPlanOpen, setIsAutoPlanOpen] = useState(false);
  const [autoPlanPrompt, setAutoPlanPrompt] = useState("");
  const [isAutoPlanning, setIsAutoPlanning] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    // Fetch History of Outfits (for planning)
    const fetchOutfits = async () => {
      try {
        const outfitsSnap = await getDocs(query(collection(db, `users/${user.uid}/outfits`)));
        const wardrobeSnap = await getDocs(query(collection(db, `users/${user.uid}/wardrobe`)));
        
        const wardrobeMap = new Map<string, WardrobeItem>();
        const itemsList: WardrobeItem[] = [];
        wardrobeSnap.docs.forEach(d => {
           const data = d.data() as WardrobeItem;
           wardrobeMap.set(d.id, data);
           itemsList.push(data);
        });
        setWardrobe(itemsList);

        const outfitsData = outfitsSnap.docs.map(doc => {
          const outfit = doc.data() as Outfit;
          const itemsDetails = outfit.itemIds.map(id => wardrobeMap.get(id)).filter(Boolean) as WardrobeItem[];
          return { ...outfit, itemsDetails };
        });
        setOutfits(outfitsData);
      } catch (e) {
        console.error("Failed to fetch outfits");
      }
    };

    fetchOutfits();

    // Listen to Events
    const q = query(collection(db, `users/${user.uid}/events`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvents(snapshot.docs.map(d => d.data() as CalendarEvent));
    });

    return unsubscribe;
  }, [user]);

  const handleAddEvent = async () => {
    if (!user || !date || !title) return;
    try {
      const eventId = crypto.randomUUID();
      const newEvent: CalendarEvent = {
        id: eventId,
        userId: user.uid,
        title,
        date: format(date, 'yyyy-MM-dd'),
        outfitId: selectedOutfitId || undefined,
        createdAt: Date.now()
      };
      await setDoc(doc(db, `users/${user.uid}/events`, eventId), newEvent);
      setIsDialogOpen(false);
      setTitle("");
      setSelectedOutfitId("");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/events`);
    }
  };

  const handleAutoPlan = async () => {
    if (!user || !date || !autoPlanPrompt || wardrobe.length === 0) return;
    setIsAutoPlanning(true);
    try {
      const res = await fetch('/api/auto-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: autoPlanPrompt, items: wardrobe, startDate: format(date, 'yyyy-MM-dd') })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      let resultStr = data.result;
      if (resultStr.startsWith('```json')) {
        resultStr = resultStr.replace(/```json\n/, '').replace(/\n```/, '');
      }

      const generatedEvents = JSON.parse(resultStr);

      for (const ev of generatedEvents) {
         // Create the outfit first
         const outfitId = crypto.randomUUID();
         const newOutfit: Outfit = {
           id: outfitId,
           userId: user.uid,
           itemIds: ev.itemIds,
           prompt: ev.outfitDescription,
           explanation: ev.outfitDescription, // use prompt as explanation or empty
           createdAt: Date.now()
         };
         await setDoc(doc(db, `users/${user.uid}/outfits`, outfitId), newOutfit);

         // Create the event
         const eventId = crypto.randomUUID();
         const newEvent: CalendarEvent = {
           id: eventId,
           userId: user.uid,
           title: ev.title,
           date: ev.date,
           outfitId: outfitId,
           createdAt: Date.now()
         };
         await setDoc(doc(db, `users/${user.uid}/events`, eventId), newEvent);
      }
      setIsAutoPlanOpen(false);
      setAutoPlanPrompt("");
    } catch(e) {
      console.error(e);
      alert('Failed to auto plan');
    } finally {
      setIsAutoPlanning(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 relative z-10 transition-all duration-300">
        <h2 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight text-white drop-shadow-sm mb-4 capitalize">Plans</h2>
        <p className="text-white/90 font-sans font-medium px-8 py-3 rounded-full text-sm max-w-sm mb-6">Sign in to plan your outfits ahead of time.</p>
      </div>
    );
  }

  const selectedDateStr = date ? format(date, 'yyyy-MM-dd') : '';
  const todaysEvents = events.filter(e => e.date === selectedDateStr);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col gap-8 pt-8 relative z-10 animate-in fade-in">
      <div className="flex justify-between items-end mb-2 ml-2">
         <h2 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight text-white drop-shadow-sm capitalize">Plans</h2>
         <div className="flex gap-2">
           <Dialog open={isAutoPlanOpen} onOpenChange={setIsAutoPlanOpen}>
             <DialogTrigger render={<Button className="bg-white/80 backdrop-blur-md rounded-full px-6 h-12 shadow-lg hover:scale-105 transition-transform capitalize font-sans font-medium hidden md:flex items-center gap-2 text-pink-500 border border-pink-200" />}>
                 <Sparkles className="w-5 h-5 text-pink-400" />
                 Auto Plan Week
             </DialogTrigger>
             <DialogContent className="duo-card p-6 md:p-8 border-none w-[95vw] md:max-w-md max-h-[85vh] overflow-y-auto no-scrollbar">
               <DialogHeader className="mb-4">
                 <DialogTitle className="font-display italic font-medium text-2xl tracking-tight text-gray-900 capitalize flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-pink-400" /> Auto Plan
                 </DialogTitle>
               </DialogHeader>
               <div className="flex flex-col gap-6">
                 <p className="text-sm font-sans text-gray-500">Let MiniModelMe™ use Gemini to build out your week! Describe what your upcoming week looks like.</p>
                 <div className="flex flex-col gap-2">
                   <Label className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-400 ml-2">Your Week</Label>
                   <Input value={autoPlanPrompt} onChange={e => setAutoPlanPrompt(e.target.value)} placeholder="e.g. Work Mon-Wed, beach day thurs, club fri, chill weekend" className="bg-gray-50 border-none rounded-2xl h-12 px-4 shadow-none focus:ring-2 ring-pink-200" />
                 </div>
                 <Button onClick={handleAutoPlan} disabled={isAutoPlanning || !autoPlanPrompt} className="mt-4 y2k-btn-primary h-12 w-full text-sm shadow-none font-bold uppercase tracking-widest flex gap-2">
                    {isAutoPlanning ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate Schedule"}
                 </Button>
               </div>
             </DialogContent>
           </Dialog>

           <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
             <DialogTrigger render={<Button className="y2k-btn-primary rounded-full px-8 h-12 shadow-lg hover:scale-105 transition-transform capitalize font-sans font-medium hidden md:flex items-center gap-2" />}>
                 + Plan A Look
             </DialogTrigger>
             <DialogContent className="duo-card p-6 md:p-8 border-none w-[95vw] md:max-w-md max-h-[85vh] overflow-y-auto no-scrollbar">
             <DialogHeader className="mb-4">
               <DialogTitle className="font-display italic font-medium text-2xl tracking-tight text-gray-900 capitalize">plan for {date ? format(date, 'MMM d') : ''}</DialogTitle>
             </DialogHeader>
             <div className="flex flex-col gap-6">
               <div className="flex flex-col gap-2">
                 <Label className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-400 ml-2">Event Title</Label>
                 <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. coffee date" className="bg-gray-50 border-none rounded-2xl h-12 px-4 shadow-none focus:ring-2 ring-pink-200" />
               </div>
               <div className="flex flex-col gap-2">
                 <Label className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-400 ml-2">Select an Outfit (Optional)</Label>
                 <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
                   {outfits.map(outfit => (
                     <div 
                       key={outfit.id} 
                       onClick={() => setSelectedOutfitId(outfit.id === selectedOutfitId ? "" : outfit.id)}
                       className={`border-2 rounded-[24px] p-3 cursor-pointer transition-all bg-white shadow-sm flex flex-col gap-3 ${selectedOutfitId === outfit.id ? 'border-pink-400 ring-4 ring-pink-100 bg-pink-50' : 'border-transparent hover:border-pink-200 hover:bg-pink-50/50'}`}
                     >
                       <div className="text-[10px] font-sans font-bold uppercase tracking-widest text-pink-500 truncate">{outfit.prompt || "Saved Outfit"}</div>
                       <div className="flex -space-x-2 overflow-hidden mx-auto py-1">
                         {outfit.itemsDetails.slice(0, 3).map((item, idx) => (
                           <img key={idx} src={item.imageUrl} className="inline-block h-10 w-10 rounded-full border-2 border-white object-cover shadow-sm bg-white mix-blend-multiply" />
                         ))}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
               <Button onClick={handleAddEvent} className="mt-4 y2k-btn-primary h-12 w-full text-sm shadow-none font-bold uppercase tracking-widest">Save Plan</Button>
             </div>
           </DialogContent>
         </Dialog>
         </div>
      </div>

      <div className="flex-1 flex flex-col xl:flex-row gap-8 pb-20">
         <div className="flex-1 flex flex-col order-2 xl:order-1">
            <div className="y2k-glass p-4 rounded-[40px] border border-white/60 bg-white/40 backdrop-blur-xl shadow-xl w-full">
               <CalendarComponent
                 mode="single"
                 selected={date}
                 onSelect={setDate}
                 components={{
                    DayButton: (props: any) => {
                      const { day, modifiers, ...rest } = props;
                      const dateStr = day.date ? format(day.date, 'yyyy-MM-dd') : null;
                      const dayEvents = dateStr ? events.filter(e => e.date === dateStr) : [];
                      const event = dayEvents[0];
                      const assignedOutfit = event ? outfits.find(o => o.id === event.outfitId) : null;
                      
                      return (
                        <button
                          {...rest}
                          className={`w-full h-full aspect-square md:aspect-auto md:min-h-[120px] p-2 flex flex-col justify-start items-start border-2 border-dashed transition-all focus:ring-0 rounded-3xl overflow-hidden relative group outline-none
                            ${modifiers.selected ? 'bg-white/90 border-pink-400 border-solid shadow-lg scale-105 z-10' : 'bg-white/40 border-pink-200/50 hover:bg-white/80 hover:border-pink-300'}
                            ${modifiers.outside ? 'opacity-40' : 'opacity-100'}
                          `}
                        >
                          <span className={`text-sm font-display font-medium p-1 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${modifiers.selected ? 'bg-pink-400 text-white shadow-md' : 'text-gray-600 group-hover:text-pink-500'}`}>
                            {day.date.getDate()}
                          </span>
                          {assignedOutfit && (
                            <div className="mt-auto w-full flex -space-x-2 overflow-hidden items-center justify-center group-hover:scale-105 transition-transform pb-1">
                              {assignedOutfit.itemsDetails.slice(0, 3).map((item, idx) => (
                                <img key={idx} src={item.imageUrl} className="h-8 w-8 md:h-12 md:w-12 rounded-full border-2 border-white object-cover mix-blend-multiply bg-white shadow-sm" />
                              ))}
                            </div>
                          )}
                          {!assignedOutfit && event && (
                            <div className="mt-auto mb-1 w-full text-center px-1">
                               <div className="text-[9px] md:text-[10px] font-sans font-bold text-white bg-pink-400 rounded-full px-2 py-1 uppercase tracking-widest line-clamp-1 truncate shadow-sm">
                                 {event.title}
                               </div>
                            </div>
                          )}
                        </button>
                      );
                    }
                 }}
                 className="w-full bg-transparent p-0 text-gray-700 font-sans shadow-none border-none"
                 classNames={{
                   months: "w-full flex flex-col space-y-4",
                   month: "space-y-4 w-full",
                   table: "w-full border-collapse border-spacing-2 space-y-2",
                   head_row: "flex w-full mb-4 px-2",
                   head_cell: "text-pink-600 rounded-md w-full font-display font-bold text-sm text-center uppercase tracking-widest",
                   row: "flex w-full mt-2 gap-2 md:gap-4 px-2",
                   cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 w-full xl:min-w-[80px]",
                   day: "",
                   nav: "space-x-1 flex items-center bg-white/60 p-1 rounded-full shadow-sm backdrop-blur-md",
                   month_caption: "flex justify-start pt-2 pl-4",
                   caption_label: "text-2xl md:text-3xl font-display italic font-medium tracking-tight text-white drop-shadow-md capitalize",
                 }}
               />
            </div>
         </div>

         <div className="xl:w-[350px] shrink-0 flex flex-col order-1 xl:order-2">
            <div className="y2k-card p-6 md:p-8 flex flex-col border border-white/60 bg-white/80 overflow-hidden shadow-2xl relative min-h-[400px] xl:min-h-[600px] rounded-[40px]">
               <h3 className="text-2xl font-display italic font-medium tracking-tight text-gray-900 capitalize mb-6 pb-4 border-b border-pink-100 flex justify-between items-center">
                  <span>{date ? format(date, 'MMM do') : "select a date"}</span>
                  <div className="text-xs font-sans font-bold uppercase tracking-widest text-pink-400 bg-pink-50 px-3 py-1 rounded-full">Agenda</div>
               </h3>
               
               {todaysEvents.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm font-sans">
                    <div className="w-20 h-20 bg-pink-50 rounded-full flex items-center justify-center mb-4">
                       <CalendarIcon className="w-10 h-10 text-pink-300" />
                    </div>
                    <p className="font-display font-medium text-lg capitalize text-gray-500">Nothing Planned.</p>
                    <p className="font-sans text-sm text-gray-400 mt-2 text-center">Select a date and click 'Plan A Look' to schedule your outfits.</p>
                    
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger render={<Button className="mt-8 y2k-btn-secondary bg-white rounded-full px-8 h-12 shadow-sm font-sans font-bold capitalize tracking-widest text-[#ff71ce] border-none md:hidden w-full flex items-center justify-center gap-2" />}>
                          + Plan Looks
                      </DialogTrigger>
                    </Dialog>
                  </div>
               ) : (
                  <div className="flex flex-col gap-4 flex-1 overflow-y-auto no-scrollbar pr-2">
                    {todaysEvents.map(event => {
                      const assignedOutfit = outfits.find(o => o.id === event.outfitId);
                      return (
                        <div key={event.id} className="border border-pink-100 rounded-[28px] p-5 flex flex-col gap-4 bg-white hover:shadow-md transition-all group relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-[#ff71ce] to-[#b983ff]"></div>
                          <div className="flex-1 flex flex-col justify-center pl-2">
                            <p className="text-[9px] font-sans font-bold uppercase tracking-widest text-pink-400 mb-1">Scheduled Event</p>
                            <h3 className="font-display italic font-medium tracking-tight text-xl text-gray-900 capitalize">{event.title}</h3>
                            {assignedOutfit ? (
                               <p className="text-gray-500 text-sm mt-2 font-sans font-medium line-clamp-2 leading-relaxed bg-gray-50 p-3 rounded-2xl">{assignedOutfit.prompt || "Curated Look"}</p>
                            ) : (
                               <p className="text-gray-400 text-sm mt-2 font-sans font-medium italic">No outfit assigned to this event.</p>
                            )}
                          </div>
                          {assignedOutfit && (
                            <div className="flex gap-2 shrink-0 items-center pl-2">
                              {assignedOutfit.itemsDetails.map((item, index) => (
                                <div key={item.id} className="w-14 h-16 rounded-2xl overflow-hidden shadow-sm group-hover:-translate-y-1 transition-transform border border-gray-100 bg-white flex items-center justify-center">
                                  <img src={item.imageUrl} className="w-full h-full object-contain mix-blend-multiply p-1" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
}

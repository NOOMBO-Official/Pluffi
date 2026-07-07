import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { Button } from '../components/ui/button';
import { User, LogOut, Lock, LayoutGrid, Heart } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import { DeviceLinkScanner } from '../components/DeviceLinkScanner';

export default function ProfilePage() {
  const { user, logOut } = useAuth();
  const [stats, setStats] = useState({ items: 0, outfits: 0 });

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      try {
         const itemsSnap = await getDocs(query(collection(db, `users/${user.uid}/wardrobe`)));
         const outfitsSnap = await getDocs(query(collection(db, `users/${user.uid}/outfits`)));
         setStats({
           items: itemsSnap.size,
           outfits: outfitsSnap.size
         });
      } catch (e) {
         console.error(e);
      }
    };
    fetchStats();
  }, [user]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 relative z-10 transition-all duration-300">
        <h2 className="text-4xl md:text-5xl font-display italic font-medium tracking-tight text-white drop-shadow-sm mb-4 capitalize">Profile</h2>
        <p className="text-white/90 font-sans font-medium px-8 py-3 rounded-full text-sm max-w-sm mb-6">Sign in to manage your account.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto h-full flex flex-col items-center pt-8 relative z-10 overflow-y-auto no-scrollbar animate-in fade-in">
       <div className="w-32 h-32 rounded-[32px] bg-white/80 backdrop-blur-md border border-white flex items-center justify-center mb-6 overflow-hidden shadow-sm p-2">
         <div className="w-full h-full rounded-[24px] overflow-hidden bg-pink-50 flex items-center justify-center">
           {user.photoURL ? (
             <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
           ) : (
             <User className="w-12 h-12 text-pink-300" />
           )}
         </div>
       </div>
       
       <h1 className="text-3xl md:text-4xl font-display italic font-medium tracking-tight mb-2 text-white drop-shadow-sm capitalize">{user.displayName || "Welcome"}</h1>
       <p className="text-xs font-sans font-medium text-white/90 mb-10 bg-black/10 backdrop-blur-sm px-6 py-2 rounded-full border border-white/20">{user.email}</p>

       <div className="flex gap-4 w-full mb-8">
          <div className="flex-1 duo-card p-6 text-center shrink-0 border-none shadow-sm">
             <div className="text-4xl font-display italic font-medium leading-none mb-2 text-gray-900">{stats.items}</div>
             <div className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-400 flex items-center justify-center gap-1"><LayoutGrid className="w-3 h-3"/> Items</div>
          </div>
          <div className="flex-1 duo-card p-6 text-center shrink-0 border-none shadow-sm">
             <div className="text-4xl font-display italic font-medium leading-none mb-2 text-gray-900">{stats.outfits}</div>
             <div className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-400 flex items-center justify-center gap-1"><Heart className="w-3 h-3"/> Looks</div>
          </div>
       </div>

       <div className="duo-card p-6 md:p-8 w-full border-none flex flex-col gap-6">
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 mb-3 ml-2">Link Devices</p>
            <DeviceLinkScanner />
          </div>

          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 mb-3 ml-2">Privacy & Security</p>
            <div className="flex items-center gap-4 text-sm mb-4 bg-white/60 p-4 rounded-2xl border border-white/40">
               <Lock className="w-5 h-5 text-gray-400 flex-shrink-0" />
               <p className="font-sans text-gray-600 text-sm">Your digital closet is secured safely inside Google Firebase.</p>
            </div>
          </div>
          
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-500 mb-3 ml-2">Account</p>
            <Button className="w-full y2k-btn-secondary h-12 text-sm border-none shadow-none bg-white/60 text-red-500 hover:bg-white hover:text-red-600" onClick={logOut}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
       </div>
       <div className="h-24 w-full" />
    </div>
  );
}

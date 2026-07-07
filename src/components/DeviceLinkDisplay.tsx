import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { QrCode, Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';

export function DeviceLinkDisplay() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { signInWithToken } = useAuth();

  useEffect(() => {
    let interval: any;
    
    const startSession = async () => {
      try {
        const res = await fetch('/api/qr-token/create', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSessionId(data.sessionId);
        
        interval = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/qr-token/poll/${data.sessionId}`);
            const pollData = await pollRes.json();
            if (pollData.status === 'approved' && pollData.customToken) {
              clearInterval(interval);
              await signInWithToken(pollData.customToken);
              setIsOpen(false);
            }
          } catch(e) {
            console.error("Polling error", e);
          }
        }, 2000);
      } catch(e: any) {
        setError(e.message || "Failed to create QR session. Backend may not be configured.");
      }
    };

    if (isOpen) {
      startSession();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen]);

  const qrData = typeof window !== 'undefined' && sessionId ? `${window.location.origin}/link?session=${sessionId}` : sessionId;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="outline" className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border border-white/40 px-6 h-10 rounded-full text-sm font-sans font-medium flex gap-2" />}>
        <QrCode className="w-4 h-4" /> QR Login
      </DialogTrigger>
      <DialogContent className="duo-card p-8 border-none sm:max-w-md text-center flex flex-col items-center">
        <h2 className="text-2xl font-display italic font-medium tracking-tight text-gray-900 mb-2">Device Link</h2>
        <p className="text-sm font-sans text-gray-500 mb-6">Scan this QR code with a logged-in device to sign in instantly.</p>
        
        {error ? (
           <p className="text-red-500 text-sm font-sans my-8">{error}</p>
        ) : sessionId ? (
           <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 animate-in zoom-in duration-300 flex items-center justify-center">
             <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData || '')}&margin=0`} alt="QR Code" className="w-[220px] h-[220px] rounded-xl" />
           </div>
        ) : (
           <div className="flex flex-col items-center justify-center py-12 text-pink-500">
             <Loader2 className="w-8 h-8 animate-spin" />
             <p className="mt-4 text-xs font-sans font-bold uppercase tracking-widest text-pink-400">Generating Session...</p>
           </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

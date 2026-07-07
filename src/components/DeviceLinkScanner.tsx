import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { QrCode, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Scanner } from '@yudiel/react-qr-scanner';

export function DeviceLinkScanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  
  const onScan = async (decodedText: string) => {
     if (loading || success) return;
     try {
       setLoading(true);
       setError(null);
       const idToken = await user?.getIdToken(true);
       if (!idToken) throw new Error("No ID Token available");

       let sessionId = decodedText;
       const match = decodedText.match(/[?&]session=([^&]+)/);
       if (match) sessionId = match[1];

       const response = await fetch('/api/qr-token/approve', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ sessionId, idToken })
       });
       
       const data = await response.json();
       if (data.error) throw new Error(data.error);

       setSuccess(true);
       setTimeout(() => setIsOpen(false), 2000);
     } catch (e: any) {
       setError(e.message || "Failed to approve device");
     } finally {
       setLoading(false);
     }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button className="y2k-btn-secondary w-full h-12 flex gap-2" />}>
        <QrCode className="w-5 h-5" /> Link New Device
      </DialogTrigger>
      <DialogContent className="duo-card p-6 border-none sm:max-w-md text-center flex flex-col items-center">
        <h2 className="text-xl font-display italic font-medium tracking-tight text-gray-900 mb-2">Scan Device QR</h2>
        <p className="text-sm font-sans text-gray-500 mb-6">Scan the QR code displayed on the device you want to log in.</p>
        
        {success ? (
           <div className="flex flex-col items-center justify-center py-12 text-green-500 animate-in fade-in zoom-in duration-300">
             <CheckCircle className="w-16 h-16 mb-4" />
             <p className="text-lg font-display font-medium text-gray-900">Device Linked!</p>
           </div>
        ) : loading ? (
           <div className="flex flex-col items-center justify-center py-12 text-pink-500">
             <Loader2 className="w-8 h-8 animate-spin mb-4" />
             <p className="text-xs font-sans font-bold uppercase tracking-widest text-pink-400">Approving...</p>
           </div>
        ) : (
           <div className="w-full relative rounded-3xl overflow-hidden bg-gray-900 aspect-square border border-gray-100 shadow-inner">
             {isOpen && (
               <Scanner
                 onScan={(result) => {
                   if (result && result.length > 0) {
                     onScan(result[0].rawValue);
                   }
                 }}
                 onError={(e) => setError("Camera access denied or unavailable.")}
                 components={{
                   audio: false,
                   finder: false
                 }}
               />
             )}
             <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40 mix-blend-multiply"></div>
             {error && <p className="text-red-500 text-xs mt-4 absolute bottom-4 left-0 right-0 z-10 bg-white/80 p-1 mx-4 rounded">{error}</p>}
           </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

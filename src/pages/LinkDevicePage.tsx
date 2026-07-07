import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { Loader2, CheckCircle } from 'lucide-react';

export default function LinkDevicePage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setErrorMsg('No session ID provided in the URL.');
      return;
    }
    if (!user) {
      setStatus('error');
      setErrorMsg('You must be logged in on this device to approve a link.');
      return;
    }

    const approve = async () => {
      try {
        const idToken = await user.getIdToken(true);
        const response = await fetch('/api/qr-token/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, idToken })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        setStatus('success');
        setTimeout(() => navigate('/'), 2000);
      } catch (e: any) {
        setStatus('error');
        setErrorMsg(e.message || 'Failed to link device.');
      }
    };
    approve();
  }, [sessionId, user, navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-full pt-32 text-center px-4 z-20 relative">
       <div className="duo-card p-12 max-w-md w-full bg-white/90 backdrop-blur-md">
         {status === 'loading' && (
           <div className="flex flex-col items-center justify-center text-pink-500">
             <Loader2 className="w-12 h-12 animate-spin mb-4" />
             <p className="text-sm font-sans font-bold uppercase tracking-widest text-pink-400">Approving Device...</p>
           </div>
         )}
         {status === 'success' && (
           <div className="flex flex-col items-center justify-center text-green-500 animate-in zoom-in">
             <CheckCircle className="w-16 h-16 mb-4" />
             <h2 className="text-2xl font-display font-medium text-gray-900 mb-2">Device Linked!</h2>
             <p className="text-gray-500 font-sans">You can now use the app on the other device.</p>
           </div>
         )}
         {status === 'error' && (
           <div className="flex flex-col items-center justify-center text-red-500">
             <h2 className="text-2xl font-display font-medium mb-2">Link Failed</h2>
             <p className="font-sans text-sm">{errorMsg}</p>
           </div>
         )}
       </div>
    </div>
  );
}

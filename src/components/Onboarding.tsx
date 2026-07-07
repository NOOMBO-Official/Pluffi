import React, { useState } from 'react';
import { Sparkles, ArrowRight, User, Shirt, Calendar } from 'lucide-react';
import { Button } from './ui/button';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Pluffi.",
      desc: "Your digital AI stylist. Let's digitize your wardrobe and create aesthetics.",
      icon: <Sparkles className="w-12 h-12 text-pink-500" />
    },
    {
      title: "Digitize Closet",
      desc: "Upload items to your Wardrobe. Take photos or add from your library.",
      icon: <Shirt className="w-12 h-12 text-indigo-500" />
    },
    {
      title: "MiniMe Model",
      desc: "Upload a full-body photo to create your virtual try-on model.",
      icon: <User className="w-12 h-12 text-blue-500" />
    },
    {
      title: "Plan & Try On",
      desc: "Use the Clueless-style picker to curate outfits, try them on, and add to your Calendar.",
      icon: <Calendar className="w-12 h-12 text-green-500" />
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-white/90 backdrop-blur-md clouds-bg">
       <div className="y2k-card p-10 max-w-sm w-full flex flex-col items-center text-center animate-in zoom-in-95 duration-500 border-none shadow-xl">
         <div className="mb-8 p-6 bg-gray-50 rounded-[32px] shadow-sm">
            {steps[step].icon}
         </div>
         <h2 className="text-3xl font-display italic font-medium tracking-tight text-gray-900 mb-4 capitalize">{steps[step].title}</h2>
         <p className="text-gray-600 font-sans font-medium mb-10">{steps[step].desc}</p>
         
         <div className="flex w-full gap-4">
           {step > 0 && (
             <Button variant="outline" className="flex-1 rounded-full h-12 border-gray-200" onClick={() => setStep(step - 1)}>Back</Button>
           )}
           <Button className="y2k-btn-primary flex-1 rounded-full h-12 shadow-none" onClick={() => {
             if (step === steps.length - 1) onComplete();
             else setStep(step + 1);
           }}>
             {step === steps.length - 1 ? "Get Started" : "Next"} <ArrowRight className="w-4 h-4 ml-2" />
           </Button>
         </div>
         
         <div className="flex gap-2 mt-8">
            {steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === step ? 'bg-pink-500' : 'bg-gray-200'}`} />
            ))}
         </div>
       </div>
    </div>
  );
}

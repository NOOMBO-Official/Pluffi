import React from 'react';
import { Music } from 'lucide-react';

export function PluffiDJApp() {
  return (
    <a 
      href="https://ais-dev-6vh4x2f373kh5benp7eil6-155879438687.us-east1.run.app/"
      target="_blank"
      rel="noopener noreferrer"
      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-purple-400 to-pink-500 shadow-[0_8px_32px_rgba(216,180,254,0.6)] flex items-center justify-center text-white hover:scale-110 transition-transform duration-300 z-50 pointer-events-auto border-4 border-white/80"
      title="Pluffi DJ Stylist"
    >
      <Music className="w-6 h-6 sm:w-8 sm:h-8 drop-shadow-md" />
    </a>
  );
}

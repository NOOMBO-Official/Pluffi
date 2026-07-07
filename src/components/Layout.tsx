import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Sparkles, Calendar as CalendarIcon, LayoutGrid, User, Shirt } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Button } from './ui/button';
import { Onboarding } from './Onboarding';
import VoiceAssistant from './VoiceAssistant';
import { DeviceLinkDisplay } from './DeviceLinkDisplay';
import { PluffiDJApp } from './PluffiDJApp';
import { motion } from 'framer-motion';

export function Layout() {
  const { user, signIn, logOut } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user && !localStorage.getItem('pluffi_onboarding')) {
      setShowOnboarding(true);
    }
  }, [user]);

  const handleOnboardingComplete = () => {
    localStorage.setItem('pluffi_onboarding', 'true');
    setShowOnboarding(false);
  };

  return (
    <div 
      className="flex flex-col h-[100dvh] overflow-hidden clouds-bg font-sans text-gray-900 relative"
    >
      <svg className="hidden">
        <filter id="goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      {/* Top Header */}
      <div className="flex justify-between items-center p-4 md:px-8 pt-6 relative z-10">
        <div className="flex items-center group cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mr-3 border border-white/40">
             <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-display font-black tracking-tight text-white lowercase">pluffi</h1>
        </div>
        <div className="flex justify-end gap-2">
          {!user ? (
             <>
               <DeviceLinkDisplay />
               <Button className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border border-white/40 px-6 h-10 rounded-full text-sm font-sans font-medium" onClick={signIn}>Sign In</Button>
             </>
          ) : (
            <div className="flex gap-4 items-center">
              <span className="text-xs font-sans font-medium text-white/90 bg-black/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 hidden sm:block">{user.email}</span>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-hidden relative z-10 w-full pb-20 md:pb-24">
        <Outlet />
      </main>

      {/* Floating Pill Navbar */}
      <div className="fixed bottom-4 md:bottom-8 inset-x-0 flex justify-center z-50 pointer-events-none px-2 sm:px-4 gap-2 items-center">
         <nav 
           style={{ filter: 'url(#goo)' }}
           className="pointer-events-auto bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_0_rgba(255,113,206,0.1)] flex justify-between items-center p-2 rounded-full gap-1 w-max min-w-[320px] max-w-[95%] relative isolate"
         >
           <PillNavItem to="/" icon={<Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />} label="Style" />
           <PillNavItem to="/wardrobe" icon={<LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6" />} label="Closet" />
           <PillNavItem to="/calendar" icon={<CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6" />} label="Plans" />
           <PillNavItem to="/model" icon={<User className="w-5 h-5 sm:w-6 sm:h-6" />} label="Model" />
           <PillNavItem to="/picker" icon={<Shirt className="w-5 h-5 sm:w-6 sm:h-6" />} label="Picker" />
           <PillNavItem to="/profile" icon={<User className="w-5 h-5 sm:w-6 sm:h-6" />} label="Profile" />
         </nav>
         <div className="pointer-events-auto">
            <PluffiDJApp />
         </div>
      </div>

      <VoiceAssistant />
    </div>
  );
}

function PillNavItem({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <NavLink
      to={to}
      className={`flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-[100px] transition-all duration-300 relative group outline-none ${isActive ? 'text-pink-500' : 'text-gray-400 hover:text-pink-400'}`}
      title={label}
    >
      {isActive && (
        <motion.div
          layoutId="pillNavIndicator"
          className="absolute inset-0 bg-gradient-to-tr from-pink-100 to-pink-50 rounded-[100px] shadow-inner border border-pink-200/50 -z-10"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <div className={`transition-all duration-300 flex items-center justify-center ${isActive ? 'scale-110 -translate-y-1.5 drop-shadow-sm text-pink-500' : 'group-hover:scale-110 group-hover:-translate-y-1.5'}`}>
        {icon}
      </div>
      <span className={`text-[8px] sm:text-[9px] font-sans font-bold uppercase tracking-[0.15em] transition-all duration-300 absolute bottom-2 ${isActive ? 'opacity-100 translate-y-0 text-pink-500' : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'}`}>
        {label}
      </span>
      {isActive && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-pink-400 shadow-[0_0_8px_rgba(255,113,206,0.8)]"></div>
      )}
    </NavLink>
  );
}

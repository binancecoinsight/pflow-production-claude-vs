import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Lock, User, Package, ArrowRight, Printer, Globe, LogIn, Activity, Eye, EyeOff } from 'lucide-react';
import AppLogo from './AppLogo';
import { useSettings } from '../context/SettingsContext';
import { useLanguage, Language } from '../context/LanguageContext';
import { APP_VERSION, LAST_UPDATED } from '../version';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Login({ onSignupClick }: { onSignupClick: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const { login, hasLoggedOut } = useAuth();
  const { settings } = useSettings();
  const { t, language, setLanguage, isRTL } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      await login(username, password);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || t('loginError') || 'An error occurred during login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const languages: { code: Language; name: string; flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
  ];

  return (
    <div className={cn("min-h-screen bg-brand-bg flex flex-col items-center relative overflow-hidden overflow-x-hidden select-none touch-pan-y overscroll-none overscroll-x-none", isRTL && "font-arabic")}>
      {/* Background Decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-accent/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 flex items-center justify-center -z-10">
          <Activity size={400} strokeWidth={1} className="opacity-[0.08] dark:opacity-[0.1] text-brand-accent rotate-12" />
        </div>
      </div>

      {/* Top Bar */}
      <div className="w-full max-w-7xl flex items-center justify-center p-4 lg:px-8 relative z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent shadow-inner">
            <AppLogo size={24} className="text-brand-accent" />
          </div>
          <div className="flex flex-col items-start text-left">
            <h1 className="text-xl font-display font-black tracking-tighter text-brand-text">Pharmacy Flow</h1>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-brand-accent uppercase tracking-widest bg-brand-accent/10 px-1.5 py-0.5 rounded-full">Enterprise</span>
              <div className="w-1 h-1 rounded-full bg-brand-border" />
              <span className="text-[8px] font-bold text-brand-muted">v{APP_VERSION}</span>
            </div>
          </div>
        </div>

        {/* Language Selector - Absolute Positioned */}
        <div className="absolute top-4 right-4 lg:right-8">
          <button 
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="bg-brand-surface border border-brand-border px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-2 hover:border-brand-accent transition-all active:scale-95"
          >
            <Globe size={16} className="text-brand-muted" />
            <span className="text-[10px] font-bold text-brand-text uppercase">{language}</span>
          </button>
          
          {isLangOpen && (
            <>
              <div 
                className="fixed inset-0 z-[-1]" 
                onClick={() => setIsLangOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-brand-surface border border-brand-border rounded-2xl shadow-xl p-2 space-y-1 animate-in fade-in zoom-in duration-200 z-[60]">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setIsLangOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                      language === lang.code ? "bg-brand-accent/10 text-brand-accent" : "hover:bg-brand-bg text-brand-text"
                    )}
                  >
                    <span className="text-brand-text">{lang.name}</span>
                    <span>{lang.flag}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Header Section (Welcome Message) */}
      <header className="w-full max-w-2xl flex flex-col items-center pt-0 pb-2 relative z-20 text-center">
        <div className="space-y-0">
          <h2 className="text-3xl lg:text-4xl font-display font-black tracking-tight text-brand-text leading-tight">
            {t('welcomeBack')}, <br />
            <span className="text-brand-accent text-[13px] lg:text-[16px] uppercase tracking-widest">{settings.storeName || 'Your Pharmacy'}</span>
          </h2>
          <p className="text-base text-brand-muted font-medium">
            {t('Please login to continue') || 'Please login to continue'}
          </p>
        </div>
      </header>

      <main className="w-full max-w-md flex flex-col items-center justify-center relative z-10 mt-6">
        {/* Login Form */}
        <div className="w-full bg-brand-surface rounded-[2.5rem] shadow-2xl border border-brand-border p-8 md:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-brand-accent/5 rounded-full -mr-24 -mt-24 blur-3xl" />
          
          <div className="flex flex-col items-center mb-10 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mb-4 shadow-inner">
              <Lock size={32} className="text-brand-accent" />
            </div>
            <h2 className="text-2xl font-display font-bold text-brand-text">{t('signIn')}</h2>
            <p className="text-brand-muted mt-1 text-sm">{t('enterCredentials')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="space-y-5">
              <div>
                <label className={cn("block text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em] mb-2 text-left", isRTL && "text-right")}>
                  {t('username') || "Username or Email"}
                </label>
                <div className="relative group">
                  <div className={cn("absolute inset-y-0 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-accent", isRTL ? "right-0 pr-4" : "left-0 pl-4")}>
                    <User size={20} className="text-brand-muted/60" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    className={cn("input-field h-14 transition-all focus:ring-4 focus:ring-brand-accent/5", isRTL ? "pr-12" : "pl-12")}
                    placeholder={"Enter username or email"}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className={cn("block text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em] mb-2 text-left", isRTL && "text-right")}>
                  {t('password')}
                </label>
                <div className="relative group">
                  <div className={cn("absolute inset-y-0 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-accent", isRTL ? "right-0 pr-4" : "left-0 pl-4")}>
                    <Lock size={20} className="text-brand-muted/60" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn("input-field h-14 pr-12 transition-all focus:ring-4 focus:ring-brand-accent/5", isRTL ? "pr-12" : "pl-12")}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-brand-muted/60 hover:text-brand-accent transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-rose-500 text-xs text-center font-bold bg-rose-500/5 py-2 rounded-lg border border-rose-500/10"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={!username || !password || isLoading}
              className={cn(
                "btn-primary w-full py-4 text-base font-display font-black transition-all duration-300 shadow-xl shadow-brand-accent/20 h-14",
                username && password && !isLoading 
                  ? "bg-brand-accent hover:opacity-100 hover:shadow-brand-accent/40 scale-[1.02] active:scale-95" 
                  : "opacity-50 grayscale"
              )}
            >
              {isLoading ? t('verifying') : t('loginNow')}
            </button>
            
            <div className="text-center pt-4">
              <p className="text-sm text-brand-muted font-medium">
                {t('dontHaveAccount')}{' '}
                <button 
                  type="button"
                  onClick={onSignupClick}
                  className="text-brand-accent font-bold hover:underline underline-offset-4"
                >
                  {t('signup')}
                </button>
              </p>
            </div>
          </form>
        </div>
      </main>

      {/* Footer Section */}
      <footer className="w-full py-8 mt-auto relative z-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-4">
          <p className="text-xs text-brand-muted font-medium italic opacity-80 text-center">
            "{t('joinThousands')}"
          </p>
          <div className="flex items-center justify-center gap-4 opacity-40">
            <div className="h-px w-12 bg-brand-border" />
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-brand-muted text-center">
              Secure Enterprise Environment
            </span>
            <div className="h-px w-12 bg-brand-border" />
          </div>
        </div>
      </footer>
    </div>
  );
}

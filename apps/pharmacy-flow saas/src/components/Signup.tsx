import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Pill, HeartPulse, Activity, Lock, User, ArrowRight, Globe, ChevronLeft, ChevronRight, Sparkles, Phone, Mail, Building, MapPin, Building2, Eye, EyeOff } from 'lucide-react';
import AppLogo from './AppLogo';
import { useLanguage, Language } from '../context/LanguageContext';
import { APP_VERSION, LAST_UPDATED } from '../version';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Country, State, City } from 'country-state-city';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Signup({ onLoginClick }: { onLoginClick: () => void }) {
  const getInitialState = () => {
    const saved = localStorage.getItem('signup_form_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  const init = getInitialState() || {};

  const [step, setStep] = useState(init.step || 1);
  const [formData, setFormData] = useState({
    name: init.name || '',
    phone: init.phone || '',
    pharmacyName: init.pharmacyName || '',
    email: init.email || '',
    country: init.country || '',
    state: init.state || '',
    city: init.city || '',
    manualCity: init.manualCity || '',
    address: init.address || '',
    password: init.password || ''
  });

  const [otp, setOtp] = useState(['', '', '', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { checkAccountExists, sendOtp, verifyOtp } = useAuth();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const countries = Country.getAllCountries();
  const states = formData.country ? State.getStatesOfCountry(formData.country) : [];
  const cities = formData.state ? City.getCitiesOfState(formData.country, formData.state) : [];

  const slides = [
    {
      title: t('slide1Title') || 'Pharmacy Excellence',
      desc: t('slide1Desc') || 'Modern pharmacies manage prescription and over-the-counter inventory with ease.',
      icon: <Pill size={40} />,
      color: 'bg-blue-500',
      image: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&q=80&w=800'
    },
    {
      title: t('slide2Title') || 'Healthcare Growth',
      desc: t('slide2Desc') || 'Clinics and pharmacies track medication sales and expenses in real-time.',
      icon: <HeartPulse size={40} />,
      color: 'bg-emerald-500',
      image: 'https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&q=80&w=800'
    },
    {
      title: t('slide3Title') || 'Patient Service Efficiency',
      desc: t('slide3Desc') || 'Consultation rooms and labs manage patient records and billing professionally.',
      icon: <Activity size={40} />,
      color: 'bg-sky-500',
      image: 'https://images.unsplash.com/photo-1547489432-cf93fa6c71ee?auto=format&fit=crop&q=80&w=800'
    }
  ];

  useEffect(() => {
    localStorage.setItem('signup_form_state', JSON.stringify({ ...formData, step }));
  }, [formData, step]);

  useEffect(() => {
    if (!showForm && step === 1) {
      const timer = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [showForm, step]);

  const nextSlide = () => {
    if (currentSlide === slides.length - 1) {
      setShowForm(true);
    } else {
      setCurrentSlide(prev => prev + 1);
    }
  };

  const prevSlide = () => {
    setCurrentSlide(prev => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const accountCheck = await checkAccountExists(formData.email, formData.phone, formData.pharmacyName);
    if (accountCheck.exists) {
      setError(accountCheck.error || 'Account info already taken.');
      setIsLoading(false);
      return;
    }

    const result = await sendOtp(formData.email);
    if (result.success) {
      setStep(2);
      setShowForm(true);
    } else {
      setError(result.error || 'Failed to send verification email. Please try again.');
    }
    setIsLoading(false);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const vals = value.slice(0, 8).split('');
      const newOtp = [...otp];
      vals.forEach((v, i) => {
        if (i < 8) newOtp[i] = v;
      });
      setOtp(newOtp);
      return;
    }
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 7) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const code = otp.join('');
    if (code.length !== 8) {
      setError('Please enter all 8 digits.');
      setIsLoading(false);
      return;
    }

    const finalCity = formData.city === 'manual' ? formData.manualCity : formData.city;
    
    const result = await verifyOtp(code, {
      ...formData,
      city: finalCity
    });

    if (result.success) {
      localStorage.removeItem('signup_form_state');
    } else {
      setError(result.error || 'Invalid OTP code. Please try again.');
    }
    setIsLoading(false);
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
    <div className={cn("min-h-screen bg-brand-bg flex flex-col items-center justify-center p-4 relative overflow-hidden overflow-x-hidden select-none touch-pan-y overscroll-none overscroll-x-none", isRTL && "font-arabic")}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-accent/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 flex items-center justify-center -z-10">
          <Activity size={400} strokeWidth={1} className="opacity-[0.08] dark:opacity-[0.1] text-brand-accent rotate-12" />
        </div>
      </div>

      <div className="fixed top-6 right-6 z-50">
        <div className="relative">
          <button 
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="bg-brand-surface border border-brand-border p-3 rounded-2xl shadow-sm flex items-center gap-2 hover:border-brand-accent transition-all active:scale-95"
          >
            <Globe size={20} className="text-brand-muted" />
            <span className="text-sm font-bold text-brand-text uppercase">{language}</span>
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

      <AnimatePresence mode="wait">
        {!showForm && step === 1 ? (
          <motion.div 
            key="onboarding"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="max-w-xl w-full space-y-8 p-8 bg-brand-surface rounded-[3rem] border border-brand-border shadow-2xl relative z-10"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-brand-accent/10 rounded-2xl flex items-center justify-center text-brand-accent mb-6 shadow-inner">
                <AppLogo size={40} className="text-brand-accent" />
              </div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-brand-text mb-4 leading-tight">
                {t('welcomeToPharmacyFlow') || 'Welcome to Pharmacy Flow'}
              </h1>
              <p className="text-lg text-brand-muted font-medium max-w-lg mx-auto">
                {t('mostPowerfulTool') || 'The most powerful tool for tracking and managing multi-branch pharmacies.'}
              </p>
            </div>

            <div className="relative bg-brand-bg border border-brand-border rounded-[2.5rem] overflow-hidden shadow-inner group">
              <div className="aspect-[16/10] relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSlide}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0"
                  >
                    <img 
                      src={slides[currentSlide].image} 
                      alt={slides[currentSlide].title}
                      className="w-full h-full object-cover opacity-20 grayscale"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 p-8 flex flex-col items-center justify-center text-center">
                      <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg", slides[currentSlide].color)}>
                        {slides[currentSlide].icon}
                      </div>
                      <h3 className="text-2xl font-bold text-brand-text mb-3">{slides[currentSlide].title}</h3>
                      <p className="text-base text-brand-muted font-medium max-w-sm">{slides[currentSlide].desc}</p>
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
                  <button 
                    onClick={prevSlide}
                    className="p-2 rounded-full bg-brand-surface/80 border border-brand-border text-brand-muted hover:text-brand-accent transition-all pointer-events-auto active:scale-90"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    onClick={nextSlide}
                    className="p-2 rounded-full bg-brand-surface/80 border border-brand-border text-brand-muted hover:text-brand-accent transition-all pointer-events-auto active:scale-90"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                  {slides.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        currentSlide === idx ? "w-8 bg-brand-accent" : "w-2 bg-brand-border hover:bg-brand-muted"
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => setShowForm(true)}
                className="btn-primary w-full py-4 text-lg font-black rounded-2xl shadow-xl shadow-brand-accent/20 flex items-center justify-center gap-2 group"
              >
                {currentSlide === slides.length - 1 ? 'Get Started' : 'Skip to Signup'}
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              
              <div className="text-center">
                <button 
                  onClick={onLoginClick}
                  className="text-sm font-bold text-brand-muted hover:text-brand-accent transition-colors"
                >
                  Already have an account? Login
                </button>
              </div>
            </div>
          </motion.div>
        ) : step === 1 ? (
          <motion.div 
            key="signup-form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl w-full bg-brand-surface rounded-[3rem] shadow-2xl border border-brand-border p-8 md:p-10 relative overflow-hidden z-10 max-h-[90vh] overflow-y-auto no-scrollbar"
          >
            <button 
              onClick={() => setShowForm(false)}
              className="absolute top-6 left-6 p-2 text-brand-muted hover:text-brand-accent transition-colors"
            >
              <ChevronLeft size={24} />
            </button>

            <div className="flex flex-col items-center mb-8 pt-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent shadow-inner">
                  <AppLogo size={24} className="text-brand-accent" />
                </div>
                <div className="flex flex-col leading-tight">
                  <h1 className="text-xl font-black tracking-tighter text-brand-text">
                    Pharmacy Flow
                  </h1>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-brand-text">{t('createAccount') || 'Create Account'}</h2>
            </div>

            <form onSubmit={handleStep1Submit} className="space-y-6 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Personal Info */}
                <div className="space-y-4 md:col-span-2">
                  <h3 className="font-bold text-brand-text text-sm">Owner Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <User size={18} className="text-brand-muted/60" />
                        </div>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => updateFormData('name', e.target.value)}
                          className="input-field h-12 pl-12 text-sm"
                          placeholder="Owner Full Name"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Mail size={18} className="text-brand-muted/60" />
                        </div>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => updateFormData('email', e.target.value)}
                          className="input-field h-12 pl-12 text-sm"
                          placeholder="Email Address"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Phone size={18} className="text-brand-muted/60" />
                        </div>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => updateFormData('phone', e.target.value)}
                          className="input-field h-12 pl-12 text-sm"
                          placeholder="Phone Number"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Lock size={18} className="text-brand-muted/60" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={formData.password}
                          onChange={(e) => updateFormData('password', e.target.value)}
                          className="input-field h-12 pl-12 pr-12 text-sm"
                          placeholder="Password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-4 flex items-center text-brand-muted/60 hover:text-brand-accent transition-colors"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Business Info */}
                <div className="space-y-4 md:col-span-2 pt-4 border-t border-brand-border/50">
                  <h3 className="font-bold text-brand-text text-sm">Pharmacy Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                       <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Building2 size={18} className="text-brand-muted/60" />
                          </div>
                          <input
                            type="text"
                            value={formData.pharmacyName}
                            onChange={(e) => updateFormData('pharmacyName', e.target.value)}
                            className="input-field h-12 pl-12 text-sm"
                            placeholder="Pharmacy Name"
                            required
                          />
                        </div>
                    </div>

                    <div>
                      <select
                        value={formData.country}
                        onChange={(e) => {
                          updateFormData('country', e.target.value);
                          updateFormData('state', '');
                          updateFormData('city', '');
                        }}
                        className="input-field h-12 text-sm"
                        required
                      >
                        <option value="">Select Country</option>
                        {countries.map(c => (
                          <option key={c.isoCode} value={c.isoCode}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <select
                        value={formData.state}
                        onChange={(e) => {
                          updateFormData('state', e.target.value);
                          updateFormData('city', '');
                        }}
                        className="input-field h-12 text-sm"
                        required
                        disabled={!formData.country}
                      >
                        <option value="">Select State/Province</option>
                        {states.map(s => (
                          <option key={s.isoCode} value={s.isoCode}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <select
                          value={formData.city}
                          onChange={(e) => updateFormData('city', e.target.value)}
                          className="input-field h-12 text-sm"
                          required
                          disabled={!formData.state}
                        >
                          <option value="">Select City (Optional dropdown)</option>
                          {cities.map(c => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                          <option value="manual">Other (Enter Manually)</option>
                        </select>
                      </div>

                      {formData.city === 'manual' && (
                        <div>
                           <input
                            type="text"
                            value={formData.manualCity}
                            onChange={(e) => updateFormData('manualCity', e.target.value)}
                            className="input-field h-12 text-sm"
                            placeholder="Enter City Name"
                            required
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="md:col-span-2">
                       <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <MapPin size={18} className="text-brand-muted/60" />
                          </div>
                          <input
                            type="text"
                            value={formData.address}
                            onChange={(e) => updateFormData('address', e.target.value)}
                            className="input-field h-12 pl-12 text-sm"
                            placeholder="Full Address"
                            required
                          />
                        </div>
                    </div>
                  </div>
                </div>
              </div>

              {error && <p className="text-rose-500 text-xs text-center font-bold bg-rose-500/5 py-2 rounded-lg border border-rose-500/10">{error}</p>}

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full py-4 text-base font-black transition-all duration-300 shadow-xl shadow-brand-accent/20 h-14 bg-brand-accent hover:opacity-100 scale-[1.02] active:scale-95"
              >
                {isLoading ? 'Processing...' : 'Continue to Verification'}
              </button>
              
              <div className="text-center space-y-2">
                <p className="text-sm text-brand-muted font-medium">
                  {t('alreadyHaveAccount') || 'Already have an account?'}{' '}
                  <button 
                    type="button"
                    onClick={() => {
                        localStorage.removeItem('signup_form_state');
                        onLoginClick();
                    }}
                    className="text-brand-accent font-bold hover:underline underline-offset-4"
                  >
                    {t('login') || 'Login'}
                  </button>
                </p>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div 
            key="otp-form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full bg-brand-surface rounded-[3rem] shadow-2xl border border-brand-border p-8 md:p-10 relative overflow-hidden z-10 text-center"
          >
            <div className="w-16 h-16 bg-brand-accent/10 rounded-full flex items-center justify-center text-brand-accent mx-auto mb-6 shadow-inner">
               <Mail size={32} />
            </div>
            
            <h2 className="text-2xl font-bold text-brand-text mb-2">Verify Email</h2>
            <p className="text-sm text-brand-muted mb-8">
              We've sent an 8-digit verification code to <span className="font-bold text-brand-text">{formData.email}</span>
            </p>

            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div className="flex justify-center gap-1 sm:gap-2 mb-4" dir="ltr">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    id={`otp-${index}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="w-8 sm:w-11 h-12 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-lg sm:rounded-xl border border-brand-border bg-brand-bg focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 outline-none transition-all"
                    required
                  />
                ))}
              </div>

              {error && <p className="text-rose-500 text-xs text-center font-bold bg-rose-500/5 py-2 rounded-lg border border-rose-500/10">{error}</p>}

              <button
                type="submit"
                disabled={isLoading || otp.join('').length !== 8}
                className="btn-primary w-full py-4 text-base font-black transition-all duration-300 shadow-xl shadow-brand-accent/20 h-14 bg-brand-accent hover:opacity-100 scale-[1.02] active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                {isLoading ? 'Verifying...' : 'Verify & Create Account'}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm font-bold text-brand-muted hover:text-brand-accent transition-colors mt-4"
              >
                Back to Registration
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

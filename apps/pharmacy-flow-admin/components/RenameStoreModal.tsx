'use client';

import React, { useState, useMemo } from 'react';
import { X, Edit3, Building2, Search, CheckCircle2, ArrowRight } from 'lucide-react';
import { Pharmacy } from '@/lib/mock-data';

interface RenameStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacies: Pharmacy[];
  initialPharmacy?: Pharmacy | null;
  onConfirmRename: (pharmacy: Pharmacy, newName: string, newState: string) => void;
}

export default function RenameStoreModal({
  isOpen,
  onClose,
  pharmacies,
  initialPharmacy = null,
  onConfirmRename,
}: RenameStoreModalProps) {
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(initialPharmacy);
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState(initialPharmacy?.business_name || '');
  const [newState, setNewState] = useState(initialPharmacy?.state || 'Lagos (Ikeja)');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return pharmacies.slice(0, 10);
    const q = searchQuery.toLowerCase();
    return pharmacies.filter(p => 
      p.business_name.toLowerCase().includes(q) ||
      p.owner_name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.state && p.state.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [pharmacies, searchQuery]);

  const handleSelect = (p: Pharmacy) => {
    setSelectedPharmacy(p);
    setNewName(p.business_name);
    setNewState(p.state || 'Lagos (Ikeja)');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPharmacy || !newName.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      onConfirmRename(selectedPharmacy, newName.trim(), newState);
      setIsSubmitting(false);
      setSuccessNotice(`Successfully renamed to "${newName.trim()}"!`);

      setTimeout(() => {
        setSuccessNotice(null);
        onClose();
      }, 1200);
    }, 350);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[220] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-card border border-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card/90">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Rename Pharmacy Store</h3>
              <p className="text-xs text-text-secondary">
                Update the official registered business name across receipt headers and cloud POS.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {successNotice ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-text-primary">{successNotice}</h4>
              <p className="text-xs text-text-secondary">
                All cloud terminals and dispensing records have been updated to reflect the new identity.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Step 1: Select Pharmacy if not chosen */}
              {!selectedPharmacy ? (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-text-secondary">
                    Search and Choose Store to Rename
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                    <input
                      type="text"
                      placeholder="Type pharmacy name, owner, or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-bg border border-border rounded-lg pl-10 pr-4 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-border/60 rounded-lg p-1">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelect(p)}
                        className="p-2.5 rounded hover:bg-accent/10 hover:border-accent/30 border border-transparent cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-text-primary">{p.business_name}</p>
                          <p className="text-[11px] text-text-secondary">{p.owner_name} • {p.state}</p>
                        </div>
                        <span className="text-[10px] font-mono text-accent font-semibold">Select →</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Selected Store Banner */}
                  <div className="p-3 bg-bg/50 border border-border rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-4 h-4 text-accent" />
                      <div>
                        <p className="font-bold text-text-primary">{selectedPharmacy.business_name}</p>
                        <p className="text-[11px] text-text-secondary">
                          Owner: {selectedPharmacy.owner_name} • ID: {selectedPharmacy.id}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPharmacy(null)}
                      className="text-xs text-accent underline"
                    >
                      Change
                    </button>
                  </div>

                  {/* Input New Name */}
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      New Registered Business Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. MediHub Pharmacy & Clinic Lekki"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  {/* Input State / Location */}
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      State / Branch Location
                    </label>
                    <input
                      type="text"
                      value={newState}
                      onChange={(e) => setNewState(e.target.value)}
                      placeholder="e.g. Lagos (Lekki Phase 1)"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  {/* Visual Transformation Preview */}
                  <div className="p-3 bg-accent/5 border border-accent/20 rounded-lg text-xs space-y-1.5">
                    <p className="font-semibold text-text-secondary text-[11px] uppercase tracking-wider">Preview on Dispensing Terminals:</p>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span className="text-text-secondary line-through truncate max-w-[160px]">{selectedPharmacy.business_name}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="text-accent font-bold truncate">{newName || 'New Name'}</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-2 flex items-center justify-between border-t border-border">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3 py-2 text-xs text-text-secondary hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !newName.trim()}
                      className="bg-accent text-white hover:bg-accent/90 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <span>Saving Changes...</span>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirm &amp; Rename</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Supplier } from './../../types/database';
import { createSupplier, updateSupplier } from '../../lib/suppliers/service';
import { validateCreateSupplierInput, validateUpdateSupplierInput } from '../../lib/suppliers/validation';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacyId: string;
  editingSupplier: Supplier | null;
  onSuccess: (supplier: Supplier) => void;
}

export const SupplierModal: React.FC<SupplierModalProps> = ({
  isOpen,
  onClose,
  pharmacyId,
  editingSupplier,
  onSuccess
}) => {
  const [name, setName] = useState<string>('');
  const [contactPerson, setContactPerson] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingSupplier) {
      setName(editingSupplier.name || '');
      setContactPerson(editingSupplier.contact_person || '');
      setPhone(editingSupplier.phone || '');
      setEmail(editingSupplier.email || '');
      setAddress(editingSupplier.address || '');
    } else {
      setName('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setAddress('');
    }
    setSubmitError(null);
    setFieldErrors({});
  }, [editingSupplier, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    if (editingSupplier) {
      // Update validation
      const validation = validateUpdateSupplierInput({
        name,
        contact_person: contactPerson,
        phone,
        email,
        address
      });

      if (!validation.isValid) {
        const errorsMap: Record<string, string> = {};
        validation.errors.forEach((err) => {
          errorsMap[err.field] = err.message;
        });
        setFieldErrors(errorsMap);
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await updateSupplier(supabase, pharmacyId, editingSupplier.id, {
          name,
          contact_person: contactPerson,
          phone,
          email,
          address
        });

        if (!result.success || !result.supplier) {
          setSubmitError(result.error || 'Failed to update supplier');
          setIsSubmitting(false);
          return;
        }

        onSuccess(result.supplier);
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error updating supplier';
        setSubmitError(msg);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Create validation
      const validation = validateCreateSupplierInput({
        pharmacy_id: pharmacyId,
        name,
        contact_person: contactPerson,
        phone,
        email,
        address
      });

      if (!validation.isValid) {
        const errorsMap: Record<string, string> = {};
        validation.errors.forEach((err) => {
          errorsMap[err.field] = err.message;
        });
        setFieldErrors(errorsMap);
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await createSupplier(supabase, {
          pharmacy_id: pharmacyId,
          name,
          contact_person: contactPerson,
          phone,
          email,
          address
        });

        if (!result.success || !result.supplier) {
          setSubmitError(result.error || 'Failed to create supplier');
          setIsSubmitting(false);
          return;
        }

        onSuccess(result.supplier);
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error creating supplier';
        setSubmitError(msg);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}
              </h2>
              <p className="text-xs text-slate-400">
                {editingSupplier ? 'Update supplier information and procurement details' : 'Add a verified supplier to your pharmacy procurement network'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {submitError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Supplier Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Supplier Name <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Novartis Pharmaceuticals Ltd"
                disabled={isSubmitting}
                className={`w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border ${
                  fieldErrors.name ? 'border-rose-500/80 focus:border-rose-500' : 'border-slate-800 focus:border-emerald-500/50'
                } text-sm text-white placeholder-slate-500 focus:outline-none transition`}
              />
            </div>
            {fieldErrors.name && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.name}</p>
            )}
          </div>

          {/* Contact Person */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Contact Person (Optional)
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Dr. John Okoro (Sales Rep)"
                disabled={isSubmitting}
                className={`w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border ${
                  fieldErrors.contact_person ? 'border-rose-500/80' : 'border-slate-800 focus:border-emerald-500/50'
                } text-sm text-white placeholder-slate-500 focus:outline-none transition`}
              />
            </div>
            {fieldErrors.contact_person && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.contact_person}</p>
            )}
          </div>

          {/* Contact Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Phone Number (Optional)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +234 803 123 4567"
                  disabled={isSubmitting}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border ${
                    fieldErrors.phone ? 'border-rose-500/80' : 'border-slate-800 focus:border-emerald-500/50'
                  } text-sm text-white placeholder-slate-500 focus:outline-none transition`}
                />
              </div>
              {fieldErrors.phone && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.phone}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address (Optional)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="orders@supplier.com"
                  disabled={isSubmitting}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border ${
                    fieldErrors.email ? 'border-rose-500/80' : 'border-slate-800 focus:border-emerald-500/50'
                  } text-sm text-white placeholder-slate-500 focus:outline-none transition`}
                />
              </div>
              {fieldErrors.email && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.email}</p>
              )}
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Physical / Depot Address (Optional)
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Depot address, warehouse location, city..."
                rows={2}
                disabled={isSubmitting}
                className={`w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border ${
                  fieldErrors.address ? 'border-rose-500/80' : 'border-slate-800 focus:border-emerald-500/50'
                } text-sm text-white placeholder-slate-500 focus:outline-none transition resize-none`}
              />
            </div>
            {fieldErrors.address && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.address}</p>
            )}
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingSupplier ? 'Update Supplier' : 'Register Supplier'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

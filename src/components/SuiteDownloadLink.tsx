import React, { useState, useEffect } from 'react';
import { Download, FileArchive, CheckCircle2, ChevronRight, Database, Code, ShieldCheck, X } from 'lucide-react';

interface ManifestData {
  ok: boolean;
  packageName: string;
  totalFiles: number;
  totalBytes: number;
  formattedSize: string;
  migrationsCount: number;
  migrations: string[];
  modules: string[];
  timestamp: string;
}

interface SuiteDownloadLinkProps {
  variant?: 'nav' | 'banner' | 'compact' | 'button';
  className?: string;
}

export const SuiteDownloadLink: React.FC<SuiteDownloadLinkProps> = ({ 
  variant = 'nav',
  className = '' 
}) => {
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [manifest, setManifest] = useState<ManifestData | null>(null);

  useEffect(() => {
    fetch('/api/export-manifest')
      .then((res) => res.json())
      .then((data: ManifestData) => {
        if (data.ok) {
          setManifest(data);
        }
      })
      .catch((err) => console.debug('[SuiteDownloadLink] Manifest fetch notice:', err));
  }, []);

  const handleDownloadClick = () => {
    setDownloading(true);
    setDownloadSuccess(false);

    // Give visual feedback and reset state after triggering download
    setTimeout(() => {
      setDownloading(false);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 5000);
    }, 1800);
  };

  // Nav link variant for top app header
  if (variant === 'nav') {
    return (
      <div className="relative inline-flex items-center">
        <a
          href="/api/export-archive"
          download="pharmacyflow-full-suite.zip"
          onClick={handleDownloadClick}
          title="Direct Browser Download of Full SaaS, Admin App & All Migrations (.zip)"
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition shadow-sm ${
            downloadSuccess
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : downloading
              ? 'bg-slate-800 text-slate-300 border-slate-700 animate-pulse'
              : 'bg-gradient-to-r from-teal-500/10 to-emerald-500/10 hover:from-teal-500/20 hover:to-emerald-500/20 text-teal-300 hover:text-white border-teal-500/30 hover:border-teal-400/50'
          } ${className}`}
        >
          {downloadSuccess ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : downloading ? (
            <div className="w-3.5 h-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <FileArchive className="w-3.5 h-3.5 text-teal-400" />
          )}
          <span>
            {downloadSuccess 
              ? 'Archive Downloaded!' 
              : downloading 
              ? 'Packaging Suite...' 
              : 'Download Suite (.zip)'}
          </span>
          {manifest && (
            <span className="hidden lg:inline-block text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950/60 text-teal-400 border border-teal-800/40">
              {manifest.migrationsCount} SQL • {manifest.formattedSize}
            </span>
          )}
        </a>

        {/* Small Details trigger button */}
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          title="View ZIP Package Contents & Migrations"
          className="ml-1 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Modal for inspect details */}
        {showDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                    <FileArchive className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">PharmacyFlow Full Suite Archive</h3>
                    <p className="text-xs text-slate-400 font-mono">pharmacyflow-full-suite.zip</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
                {/* Stats Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Code className="w-3.5 h-3.5 text-teal-400" />
                      <span>Total Files</span>
                    </div>
                    <div className="text-lg font-bold text-white font-mono">{manifest?.totalFiles || '70+'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      <span>SQL Migrations</span>
                    </div>
                    <div className="text-lg font-bold text-emerald-400 font-mono">{manifest?.migrationsCount || '16'} (M-1..M-16)</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                      <span>Config Template</span>
                    </div>
                    <div className="text-xs font-mono text-purple-300 font-semibold mt-1">.env.example</div>
                  </div>
                </div>

                {/* Included SQL Migrations */}
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <div className="font-semibold text-slate-200 mb-2 flex items-center justify-between">
                    <span>Database Migrations Included (Supabase PostgreSQL):</span>
                    <span className="text-[10px] font-mono text-emerald-400">100% Sealed</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[11px] text-slate-400">
                    {manifest?.migrations ? (
                      manifest.migrations.map((m) => (
                        <div key={m} className="truncate flex items-center gap-1.5 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                          <span className="truncate" title={m}>{m}</span>
                        </div>
                      ))
                    ) : (
                      <>
                        <div>• M-1 Identity & Security</div>
                        <div>• M-2 Membership & Roles</div>
                        <div>• M-3 Billing & Subscriptions</div>
                        <div>• M-4 POS Devices & Crypto</div>
                        <div>• M-5 Inventory Ledger</div>
                        <div>• M-6 Sync & Audit</div>
                        <div>• M-7 Final Security</div>
                        <div>• M-8 Cashier Sales RLS</div>
                        <div>• M-9 Returns & Refunds</div>
                        <div>• M-10 Offline Sync Verification</div>
                        <div>• M-11 Customers & Limits</div>
                        <div>• M-12 Multi-Tender Integrity</div>
                        <div>• M-13 Inventory Receiving</div>
                        <div>• M-14 Inventory Adjustments</div>
                        <div>• M-15 Stock Transfers</div>
                        <div>• M-16 Staff Management RPCs</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Included Application Modules */}
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <div className="font-semibold text-slate-200 mb-2">Application Modules in /src:</div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-300">
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Point of Sale (POS) & Cart Engine
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Product Inventory & Batch Expiry
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Inter-Branch Stock Transfers
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Sales History & Itemized Receipts
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Customer Accounts & Credit
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Cash Drawer Shifts & Reconciliation
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Financial & Valuation Analytics
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Cryptographic Device Pairings
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> IndexedDB Offline Sync Queue
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Multi-Tenant Context & RBAC
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Close
                </button>
                <a
                  href="/api/export-archive"
                  download="pharmacyflow-full-suite.zip"
                  onClick={() => {
                    handleDownloadClick();
                    setShowDetails(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-500/20 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Start Direct Download (.zip)</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Banner variant for screens like AuthScreen or select pharmacy
  if (variant === 'banner') {
    return (
      <div className={`p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-900 border border-teal-500/30 shadow-xl ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 flex-shrink-0">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">Full PharmacyFlow SaaS & Migration Suite</h4>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-300 border border-teal-500/20">
                  Ready to Export
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Download the complete codebase, admin modules, all 16 SQL migrations (M-1 to M-16), and sanitized .env.example template as a single ZIP file.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="/api/export-archive"
              download="pharmacyflow-full-suite.zip"
              onClick={handleDownloadClick}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-500/20 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'Packaging...' : 'Download ZIP Bundle'}</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Compact / Button variant
  return (
    <a
      href="/api/export-archive"
      download="pharmacyflow-full-suite.zip"
      onClick={handleDownloadClick}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-teal-400 hover:text-white border border-teal-500/30 text-xs font-semibold transition ${className}`}
    >
      <Download className="w-3.5 h-3.5" />
      <span>Download Full Suite (.zip)</span>
    </a>
  );
};

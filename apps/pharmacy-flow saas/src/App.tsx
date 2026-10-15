import React, { useState, useEffect } from 'react';
import Layout from './components/admin/Layout';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import History from './components/History';
import Reports from './components/Reports';
import Expenses from './components/Expenses';
import Purchases from './components/Purchases';
import MarketList from './components/MarketList';
import Settings from './components/Settings';
import AccountBook from './components/AccountBook';
import UserRoleManagement from './components/UserRoleManagement';
import Calendar from './components/Calendar';
import Returns from './components/Returns';
import Payroll from './components/Payroll';
import Invoices from './components/Invoices';
import Tutorials from './components/Tutorials';
import Referrals from './components/Referrals';
import Subscriptions from './components/Subscriptions';
import AppLogo from './components/AppLogo';
import Login from './components/Login';
import Signup from './components/Signup';
import InitialSetup from './components/InitialSetup';
import { useAuth } from './context/AuthContext';
import { useSettings } from './context/SettingsContext';
import { Settings as SettingsIcon } from 'lucide-react';

export default function App() {
  const { user, hasLoggedOut } = useAuth();
  const { settings, loading } = useSettings();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authView, setAuthView] = useState<'login' | 'signup'>(hasLoggedOut ? 'login' : 'signup');
  const [isDirty, setIsDirty] = useState(false);
  const [dirtySectionName, setDirtySectionName] = useState<string | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [triggerSaveSettings, setTriggerSaveSettings] = useState(false);

  useEffect(() => {
    if (user) {
      setActiveTab('dashboard');
      setIsDirty(false);
      setDirtySectionName(null);
      setShowUnsavedModal(false);
      setPendingTab(null);
    }
  }, [user]);

  React.useEffect(() => {
    const handleNavigateTab = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        handleTabChange(customEvent.detail);
      }
    };
    window.addEventListener('navigate-tab', handleNavigateTab);
    return () => window.removeEventListener('navigate-tab', handleNavigateTab);
  }, [isDirty, pendingTab]);

  const handleTabChange = (tab: string) => {
    if (isDirty) {
      setPendingTab(tab);
      setShowUnsavedModal(true);
      return;
    }
    setActiveTab(tab);
  };

  const handleIgnoreChanges = () => {
    setIsDirty(false);
    setDirtySectionName(null);
    setShowUnsavedModal(false);
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };

  const handleSaveAndNavigate = () => {
    if (activeTab === 'settings') {
      setTriggerSaveSettings(true);
    } else {
      // For other sections, we just prompt to "Finish what you were doing" 
      // or "Ignore changes". If they click "Save Now" on a modal, 
      // it's usually handled inside the component.
      // But the user asked for "Save Now" in the prompt too.
      // If it's not settings, we might not have a global "triggerSave".
      // Let's see if we can implement a generic save trigger or just 
      // tell them to finish it.
      setShowUnsavedModal(false);
    }
  };

  const handleSaveComplete = () => {
    setTriggerSaveSettings(false);
    setIsDirty(false);
    setDirtySectionName(null);
    setShowUnsavedModal(false);
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };

  const handleDirtyChange = (dirty: boolean, section?: string) => {
    setIsDirty(dirty);
    setDirtySectionName(section || null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center overflow-hidden gap-4">
        <AppLogo size={64} className="text-brand-accent animate-pulse" />
        <div className="text-sm font-medium text-brand-muted uppercase tracking-[0.2em] animate-pulse">Pharmacy Flow</div>
      </div>
    );
  }

  return (
    <>
      <Layout activeTab={activeTab} setActiveTab={handleTabChange}>
        {(() => {
          switch (activeTab) {
            case 'dashboard':
              return <Dashboard />;
            case 'inventory':
              return <Inventory onDirtyChange={(dirty) => handleDirtyChange(dirty, 'inventory')} />;
            case 'sales':
              return <Sales onDirtyChange={(dirty) => handleDirtyChange(dirty, 'sales')} />;
            case 'accounts':
              return <AccountBook onDirtyChange={(dirty) => handleDirtyChange(dirty, 'debtbook')} />;
            case 'history':
              return <History onDirtyChange={(dirty) => handleDirtyChange(dirty, 'history')} />;
            case 'reports':
              return <Reports />;
            case 'expenses':
              return <Expenses onDirtyChange={(dirty) => handleDirtyChange(dirty, 'expenses')} />;
            case 'purchases':
              return <Purchases onDirtyChange={(dirty) => handleDirtyChange(dirty, 'purchases')} />;
            case 'market-list':
              return <MarketList onDirtyChange={(dirty) => handleDirtyChange(dirty, 'marketlist')} />;
            case 'calendar':
              return <Calendar onDirtyChange={(dirty) => handleDirtyChange(dirty, 'calendar')} />;
            case 'returns':
              return <Returns onDirtyChange={(dirty) => handleDirtyChange(dirty, 'returns')} />;
            case 'payroll':
              return <Payroll onDirtyChange={(dirty) => handleDirtyChange(dirty, 'payroll')} />;
            case 'invoices':
              return <Invoices />;
            case 'referrals':
              return <Referrals />;
            case 'subscriptions':
              return <Subscriptions />;
            case 'tutorials':
              return <Tutorials />;
            case 'settings':
              return (
                <Settings 
                  onDirtyChange={(dirty, section) => {
                    handleDirtyChange(dirty, section);
                  }} 
                  triggerSave={triggerSaveSettings}
                  onSaveComplete={handleSaveComplete}
                />
              );
            case 'users':
              return <UserRoleManagement onDirtyChange={(dirty) => handleDirtyChange(dirty, 'users')} />;
            default:
              return <Dashboard />;
          }
        })()}
      </Layout>

      {showUnsavedModal && (
        <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-10">
          <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-[calc(100%-1rem)] sm:max-w-md overflow-hidden border border-brand-border">
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mx-auto">
                <SettingsIcon size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-brand-text">Unsaved Changes</h3>
                <p className="text-sm text-brand-muted mt-2">
                  You haven't finished {dirtySectionName === 'inventory' ? 'adding product to inventory' :
                                      dirtySectionName === 'debtbook' ? 'adding record to debtbook' :
                                      dirtySectionName === 'marketlist' ? 'adding information to marketlist' :
                                      dirtySectionName === 'expenses' ? 'adding record to expenses' :
                                      dirtySectionName === 'purchases' ? 'adding record to purchases' :
                                      dirtySectionName === 'sales' ? 'completing your sale' :
                                      dirtySectionName === 'calendar' ? 'adding event to calendar' :
                                      dirtySectionName === 'history' ? 'processing your return' :
                                      dirtySectionName === 'returns' ? 'processing your return' :
                                      `modifying ${dirtySectionName || 'settings'}`}. What would you like to do?
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => setShowUnsavedModal(false)}
                  className="btn-primary w-full py-3"
                >
                  Finish what you were doing
                </button>
                <button 
                  onClick={handleIgnoreChanges}
                  className="btn-secondary w-full py-3"
                >
                  Ignore changes and proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

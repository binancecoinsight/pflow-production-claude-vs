import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LanguageProvider } from './context/LanguageContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <SettingsProvider>
          <AuthProvider>
            <NotificationProvider>
              <App />
            </NotificationProvider>
          </AuthProvider>
        </SettingsProvider>
      </ThemeProvider>
    </LanguageProvider>
  </StrictMode>,
);

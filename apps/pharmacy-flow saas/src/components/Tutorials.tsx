import React from 'react';
import { Play, ExternalLink, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useLanguage } from '../context/LanguageContext';

interface TutorialItem {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
}

export default function Tutorials() {
  const { t } = useLanguage();

  const tutorials: TutorialItem[] = [
    {
      id: 'dashboard',
      title: t('overview'),
      description: 'Learn how to navigate your dashboard and understand your business metrics.',
      videoUrl: 'https://www.youtube.com/watch?v=placeholder1'
    },
    {
      id: 'inventory',
      title: t('inventory'),
      description: 'Master stock management, adding products, and setting low-stock alerts.',
      videoUrl: 'https://www.youtube.com/watch?v=placeholder2'
    },
    {
      id: 'sales',
      title: t('newSale'),
      description: 'Step-by-step guide on processing sales, applying discounts, and split payments.',
      videoUrl: 'https://www.youtube.com/watch?v=placeholder3'
    },
    {
      id: 'reports',
      title: t('reports'),
      description: 'How to generate and interpret detailed sales, profit, and expense reports.',
      videoUrl: 'https://www.youtube.com/watch?v=placeholder4'
    },
    {
      id: 'settings',
      title: t('settings'),
      description: 'Configure your pharmacy information, localization, and business rules.',
      videoUrl: 'https://www.youtube.com/watch?v=placeholder5'
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 bg-brand-accent/10 rounded-2xl flex items-center justify-center text-brand-accent">
          <HelpCircle size={32} />
        </div>
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text">App Tutorials</h2>
          <p className="text-sm text-brand-muted mt-1">Master Pharmacy Flow with our step-by-step video guides</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tutorials.map((tutorial, index) => (
          <motion.div
            key={tutorial.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="card group hover:border-brand-accent/30 transition-all duration-300 flex flex-col"
          >
            <div className="p-6 flex-1 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-brand-bg flex items-center justify-center text-brand-accent group-hover:bg-brand-accent group-hover:text-white transition-colors duration-300">
                <Play size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-brand-text">{tutorial.title}</h3>
                <p className="text-sm text-brand-muted mt-2 leading-relaxed">
                  {tutorial.description}
                </p>
              </div>
            </div>
            <div className="p-4 bg-brand-bg/50 border-t border-brand-border mt-auto">
              <a
                href={tutorial.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs font-bold text-brand-accent hover:text-brand-accent/80 transition-colors uppercase tracking-widest"
              >
                Click here to watch the tutorial
                <ExternalLink size={14} />
              </a>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="p-8 bg-brand-accent/5 rounded-[2rem] border border-brand-accent/10 text-center space-y-4">
        <h4 className="text-lg font-bold text-brand-text">Need more help?</h4>
        <p className="text-sm text-brand-muted max-w-2xl mx-auto">
          Our support team is available 24/7 to assist you with any questions or technical issues you may encounter.
        </p>
        <button className="btn-primary px-8 py-3">
          Contact Support
        </button>
      </div>
    </div>
  );
}

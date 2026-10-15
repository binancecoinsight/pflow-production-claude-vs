'use client';

import React from 'react';
import { Store, TrendingUp, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface KpiStatsProps {
  totalActive: number;
  totalSales: number;
  expiringSoon: number;
  onNavigateToSubscriptions?: () => void;
}

export default function KpiStats({ 
  totalActive, 
  totalSales, 
  expiringSoon,
  onNavigateToSubscriptions,
}: KpiStatsProps) {
  const stats = [
    {
      id: 'active',
      label: 'Total Active Pharmacies',
      value: totalActive.toLocaleString(),
      icon: Store,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      id: 'sales',
      label: 'Total Sales (24h)',
      value: `₦${totalSales.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-accent',
      bg: 'bg-accent/10',
    },
    {
      id: 'expiring',
      label: 'Subscriptions Expiring Soon',
      value: expiringSoon.toString(),
      icon: AlertCircle,
      color: 'text-error',
      bg: 'bg-error/10',
      action: onNavigateToSubscriptions,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          onClick={stat.action}
          className={`card-glass p-6 flex items-start justify-between ${stat.action ? 'cursor-pointer hover:border-accent/40 transition-colors' : ''}`}
        >
          <div>
            <p className="data-grid-header mb-2">{stat.label}</p>
            <h3 className="text-3xl font-bold tracking-tight data-mono">{stat.value}</h3>
            {stat.action && (
              <span className="text-[10px] text-accent font-semibold inline-block mt-2 hover:underline">
                View in Subscriptions →
              </span>
            )}
          </div>
          <div className={`${stat.bg} p-3 rounded-lg`}>
            <stat.icon className={`${stat.color} w-6 h-6`} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

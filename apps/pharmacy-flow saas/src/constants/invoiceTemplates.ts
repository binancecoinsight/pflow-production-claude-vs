export interface InvoiceTemplate {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor?: string;
  gradient?: string;
  fontFamily: string;
  borderStyle?: string;
  borderRadius?: string;
}

export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  {
    id: 'classic',
    name: 'Classic Professional',
    description: 'A standard, time-tested layout suitable for any business.',
    primaryColor: '#0f172a',
    secondaryColor: '#334155',
    fontFamily: 'font-sans',
    borderRadius: 'rounded-xl'
  },
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Clean lines, lots of whitespace, and bold accents.',
    primaryColor: '#3b82f6',
    secondaryColor: '#60a5fa',
    gradient: 'from-blue-600 to-indigo-600',
    fontFamily: 'font-sans',
    borderRadius: 'rounded-3xl'
  },
  {
    id: 'creative',
    name: 'Creative Spark',
    description: 'Dynamic layout with vibrant gradients and fluid shapes.',
    primaryColor: '#8b5cf6',
    secondaryColor: '#d946ef',
    gradient: 'from-violet-600 via-purple-600 to-fuchsia-600',
    fontFamily: 'font-sans',
    borderRadius: 'rounded-[2.5rem]'
  },
  {
    id: 'elegant',
    name: 'Elegant Royal',
    description: 'Sophisticated typography with gold accents and rich colors.',
    primaryColor: '#1e293b',
    secondaryColor: '#b45309',
    gradient: 'from-slate-900 to-slate-800',
    fontFamily: 'font-serif',
    borderRadius: 'rounded-none'
  },
  {
    id: 'tech',
    name: 'Technical Grid',
    description: 'Futuristic design with monospace accents and neon highlights.',
    primaryColor: '#10b981',
    secondaryColor: '#064e3b',
    gradient: 'from-emerald-600 to-teal-600',
    fontFamily: 'font-mono',
    borderRadius: 'rounded-none',
    borderStyle: 'border-dashed'
  },
  {
    id: 'sunset',
    name: 'Sunset Glow',
    description: 'Warm and inviting with orange-to-pink transitions.',
    primaryColor: '#f97316',
    secondaryColor: '#ec4899',
    gradient: 'from-orange-500 via-rose-500 to-pink-500',
    fontFamily: 'font-sans',
    borderRadius: 'rounded-2xl'
  },
  {
    id: 'bold',
    name: 'High Voltage',
    description: 'Ultra-bold typography with high-contrast color blocks.',
    primaryColor: '#000000',
    secondaryColor: '#fbbf24',
    gradient: 'from-black to-zinc-900',
    fontFamily: 'font-sans',
    borderRadius: 'rounded-lg'
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    description: 'Calming and professional with oceanic blue gradients.',
    primaryColor: '#0369a1',
    secondaryColor: '#0c4a6e',
    gradient: 'from-sky-700 to-indigo-900',
    fontFamily: 'font-sans',
    borderRadius: 'rounded-3xl'
  },
  {
    id: 'forest',
    name: 'Forest Fresh',
    description: 'Nature-inspired with organic green tones and soft edges.',
    primaryColor: '#15803d',
    secondaryColor: '#14532d',
    gradient: 'from-green-700 to-emerald-900',
    fontFamily: 'font-sans',
    borderRadius: 'rounded-[2rem]'
  },
  {
    id: 'premium',
    name: 'Premium Dark',
    description: 'Luxury design with deep obsidian and silver accents.',
    primaryColor: '#111827',
    secondaryColor: '#9ca3af',
    gradient: 'from-gray-900 via-zinc-900 to-black',
    fontFamily: 'font-serif',
    borderRadius: 'rounded-2xl'
  }
];

export type PopularPaperSize = 'a4' | 'letter' | 'a5' | '80mm' | '58mm';

export interface PaperSizeConfig {
  id: PopularPaperSize;
  name: string;
  badge: string;
  dimensions: string;
  category: 'sheet' | 'thermal';
  widthMm: number;
  heightMm?: number;
  previewWidthPx: number;
  description: string;
}

export const POPULAR_PAPER_SIZES: PaperSizeConfig[] = [
  {
    id: 'a4',
    name: 'A4',
    badge: 'Standard',
    dimensions: '210 × 297 mm',
    category: 'sheet',
    widthMm: 210,
    heightMm: 297,
    previewWidthPx: 794,
    description: 'International standard for commercial invoices & formal documentation'
  },
  {
    id: 'letter',
    name: 'US Letter',
    badge: 'Popular',
    dimensions: '8.5 × 11 in',
    category: 'sheet',
    widthMm: 215.9,
    heightMm: 279.4,
    previewWidthPx: 816,
    description: 'North American standard office document size'
  },
  {
    id: 'a5',
    name: 'A5',
    badge: 'Compact',
    dimensions: '148 × 210 mm',
    category: 'sheet',
    widthMm: 148,
    heightMm: 210,
    previewWidthPx: 560,
    description: 'Compact half-sheet format ideal for delivery notes and counter billing'
  },
  {
    id: '80mm',
    name: '80mm POS',
    badge: 'Thermal',
    dimensions: '80 mm roll',
    category: 'thermal',
    widthMm: 80,
    previewWidthPx: 340,
    description: 'Standard continuous thermal receipt for retail POS checkout printers'
  },
  {
    id: '58mm',
    name: '58mm Mobile',
    badge: 'Thermal',
    dimensions: '58 mm roll',
    category: 'thermal',
    widthMm: 58,
    previewWidthPx: 260,
    description: 'Handheld Bluetooth and pocket POS terminal thermal roll'
  }
];


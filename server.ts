import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ZipArchive, type ArchiverError } from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Helper function to scan files recursively for manifest
  function scanDir(dir: string, baseDir: string = dir): { path: string; size: number }[] {
    const results: { path: string; size: number }[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      // Exclude build outputs, dependencies, git and temp files
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.aistudio' || entry.name === 'tmp') {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(...scanDir(fullPath, baseDir));
      } else {
        const stat = fs.statSync(fullPath);
        results.push({ path: relativePath, size: stat.size });
      }
    }
    return results;
  }

  // API Route: Get detailed export package manifest
  app.get('/api/export-manifest', (req: Request, res: Response) => {
    try {
      const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
      const migrations: string[] = [];
      if (fs.existsSync(migrationsDir)) {
        migrations.push(
          ...fs.readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort()
        );
      }

      const rootFiles = ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', '.env.example', '.gitignore', 'metadata.json', 'README.md'];
      let totalSize = 0;
      let totalCount = 0;

      for (const rf of rootFiles) {
        const p = path.join(__dirname, rf);
        if (fs.existsSync(p)) {
          totalSize += fs.statSync(p).size;
          totalCount++;
        }
      }

      const srcFiles = scanDir(path.join(__dirname, 'src'), __dirname);
      const supabaseFiles = scanDir(path.join(__dirname, 'supabase'), __dirname);

      const allFiles = [...srcFiles, ...supabaseFiles];
      for (const f of allFiles) {
        totalSize += f.size;
        totalCount++;
      }

      res.json({
        ok: true,
        packageName: 'pharmacyflow-full-suite.zip',
        totalFiles: totalCount,
        totalBytes: totalSize,
        formattedSize: `${(totalSize / 1024).toFixed(1)} KB`,
        migrationsCount: migrations.length,
        migrations,
        modules: [
          'Point of Sale (POS Terminal & Multi-Tender)',
          'Inventory & Double-Entry Ledger',
          'Inter-Branch Stock Transfers (M-15)',
          'Sales, Returns & Audit Reversals (M-8, M-9, M-10)',
          'Customer Credit & Dispensing Limits (M-11)',
          'Supplier Management & Procurement (M-13)',
          'Cash Drawer Sessions & Blind Reconciliation (M-12)',
          'Analytics & Valuation Reports',
          'Cryptographic Device Keypair Enrollment (M-4)',
          'IndexedDB Offline Sync Engine (M-6)',
          'Multi-Tenant Auth & Staff Quotas (M-16)'
        ],
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[PharmacyFlow] Error generating manifest:', err);
      res.status(500).json({ ok: false, error: err?.message || 'Failed to generate manifest' });
    }
  });

  // API Route: Direct Browser Download of the Full Suite ZIP Archive
  app.get('/api/export-archive', (req: Request, res: Response) => {
    try {
      console.log('[PharmacyFlow] Starting full suite ZIP packaging stream...');

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="pharmacyflow-full-suite.zip"');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const archive = new ZipArchive({
        zlib: { level: 9 } // Maximum compression
      });

      archive.on('warning', (err: ArchiverError) => {
        if (err.code === 'ENOENT') {
          console.warn('[PharmacyFlow Archive Warning]', err);
        } else {
          throw err;
        }
      });

      archive.on('error', (err: ArchiverError) => {
        console.error('[PharmacyFlow Archive Error]', err);
        if (!res.headersSent) {
          res.status(500).send({ error: 'Archive packaging failed: ' + err.message });
        }
      });

      archive.pipe(res);

      // 1. Append source directory
      const srcPath = path.join(__dirname, 'src');
      if (fs.existsSync(srcPath)) {
        archive.directory(srcPath, 'src');
      }

      // 2. Append supabase migrations and functions
      const supabasePath = path.join(__dirname, 'supabase');
      if (fs.existsSync(supabasePath)) {
        archive.directory(supabasePath, 'supabase');
      }

      // 3. Append configuration files and documentation
      const filesToInclude = [
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'index.html',
        '.gitignore',
        '.env.example',
        'metadata.json',
        'README.md'
      ];

      for (const fileName of filesToInclude) {
        const filePath = path.join(__dirname, fileName);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: fileName });
        }
      }

      archive.finalize();
    } catch (err: any) {
      console.error('[PharmacyFlow] Error streaming export archive:', err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: err?.message || 'Failed to create archive' });
      }
    }
  });

  // Development: Vite Middleware Mode; Production: Serve Dist
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {}
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PharmacyFlow] Server running on http://0.0.0.0:${PORT} (mode: ${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[PharmacyFlow] Fatal error starting server:', err);
  process.exit(1);
});

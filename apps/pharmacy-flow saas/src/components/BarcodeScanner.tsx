import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera as CameraIcon } from 'lucide-react';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const readerIdRef = useRef(`reader-${Math.random().toString(36).substr(2, 9)}`);

  // Keep the callback ref up to date without triggering effects
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleClose = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (e) {
        console.error("Error stopping scanner on close", e);
      }
    }
    onClose();
  };

  useEffect(() => {
    const readerId = readerIdRef.current;
    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const permissions = await Camera.checkPermissions();
          if (permissions.camera !== 'granted') {
            const request = await Camera.requestPermissions();
            if (request.camera !== 'granted') {
              throw new Error('Camera permission denied');
            }
          }
        }

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 20,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const width = Math.floor(viewfinderWidth * 0.8);
              const height = Math.floor(viewfinderHeight * 0.4);
              return { width, height };
            }
          },
          async (decodedText) => {
            // Stop scanning once we get a result
            if (scannerRef.current?.isScanning) {
              try {
                // Important: stop the scanner before calling the callback
                // which might trigger an unmount
                await scannerRef.current.stop();
                onScanRef.current(decodedText);
              } catch (err) {
                console.error("Failed to stop scanner", err);
                // Even if stop fails, we should still call the callback
                onScanRef.current(decodedText);
              }
            }
          },
          () => {
            // Ignore normal scanning errors
          }
        );
      } catch (err: any) {
        console.error("Error starting scanner:", err);
        setError(err?.message || "Failed to start camera. Please ensure you have granted camera permissions.");
      }
    };

    startScanner();

    return () => {
      // The cleanup function in useEffect cannot be async,
      // but we can trigger the cleanup.
      // However, if the component is unmounting, the DOM element
      // might already be gone.
      if (scannerRef.current) {
        const scannerInstance = scannerRef.current;
        if (scannerInstance.isScanning) {
          scannerInstance.stop().catch(e => console.error("Error stopping scanner in cleanup", e));
        }
      }
    };
  }, []); // Only run once on mount

  return (
    <div className="fixed inset-0 bg-brand-text/80 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-10 md:pt-20">
      <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative border border-brand-border">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center">
          <div className="flex items-center gap-2 text-brand-text">
            <CameraIcon size={20} />
            <h3 className="font-bold">Scan Barcode</h3>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          {error ? (
            <div className="text-center py-8 text-rose-600">
              <p className="font-medium">{error}</p>
              <button onClick={onClose} className="mt-4 btn-secondary">Close</button>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square flex items-center justify-center">
              <div id={readerIdRef.current} className="w-full h-full"></div>
            </div>
          )}
          <p className="text-center text-sm text-brand-muted mt-4">
            Position the barcode within the frame to scan.
          </p>
        </div>
      </div>
    </div>
  );
}

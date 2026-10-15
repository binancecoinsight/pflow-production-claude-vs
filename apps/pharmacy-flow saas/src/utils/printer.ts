import { SaleItem } from '../types';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface PrintData {
  storeName: string;
  storeAddress: string;
  phoneNumber: string;
  receiptMessage: string;
  items: SaleItem[];
  totalAmount: number;
  paymentMethod: string;
  date: Date;
  currencySymbol: string;
  receiptId?: string;
  taxType?: 'percentage' | 'fixed' | 'none';
  taxValue?: number;
  taxAmount?: number;
  subTotal?: number;
  accountName?: string;
  customerName?: string;
  bankName?: string;
  accountNameDetails?: string;
  accountNumber?: string;
  storeLogo?: string;
  printLogoOnReceipt?: boolean;
  printStoreAccountOnReceipt?: boolean;
}

export class ReceiptPrinter {
  private encoder = new TextEncoder();
  private currentDevice: any = null;
  private currentCharacteristic: any = null;

  private getBytes(text: string): Uint8Array {
    return this.encoder.encode(text);
  }

  public generateReceipt(data: PrintData, paperSize: '58mm' | '80mm' | 'thermal' | 'a4' | 'a2' = '80mm'): Uint8Array {
    const commands: Uint8Array[] = [];
    const isSmall = paperSize === '58mm';
    const lineWidth = isSmall ? 32 : 42;
    const itemWidth = isSmall ? 18 : 24;
    const qtyWidth = 4;
    const priceWidth = isSmall ? 8 : 12;

    // Initialize printer
    commands.push(new Uint8Array([0x1B, 0x40]));

    // Align Center
    commands.push(new Uint8Array([0x1B, 0x61, 0x01]));

    // Store Name (Bold)
    commands.push(new Uint8Array([0x1B, 0x45, 0x01]));
    commands.push(this.getBytes(data.storeName + '\n'));
    commands.push(new Uint8Array([0x1B, 0x45, 0x00]));

    // Address & Phone
    if (data.storeAddress) commands.push(this.getBytes(data.storeAddress + '\n'));
    if (data.phoneNumber) commands.push(this.getBytes(data.phoneNumber + '\n'));
    commands.push(this.getBytes('\n'));

    // Align Left
    commands.push(new Uint8Array([0x1B, 0x61, 0x00]));

    // Date & Payment Method
    if (data.receiptId) {
      commands.push(this.getBytes(`Receipt ID: ${data.receiptId}\n`));
    }
    commands.push(this.getBytes(`Date: ${data.date.toLocaleString()}\n`));
    commands.push(this.getBytes(`Payment: ${data.paymentMethod}\n`));
    if (data.accountName) {
      commands.push(this.getBytes(`Attendant: ${data.accountName}\n`));
    }
    if (data.customerName) {
      commands.push(this.getBytes(`Customer: ${data.customerName}\n`));
    }
    commands.push(this.getBytes('-'.repeat(lineWidth) + '\n'));

    // Header
    const hItem = 'Item'.padEnd(itemWidth, ' ');
    const hQty = 'Qty'.padStart(qtyWidth, ' ');
    const hTotal = 'Total'.padStart(priceWidth, ' ');
    commands.push(this.getBytes(`${hItem} ${hQty} ${hTotal}\n`));
    commands.push(this.getBytes('-'.repeat(lineWidth) + '\n'));

    // Items
    for (const item of data.items) {
      const name = item.productName.substring(0, itemWidth).padEnd(itemWidth, ' ');
      const qty = item.quantity.toString().padStart(qtyWidth, ' ');
      const price = (item.price * item.quantity).toFixed(2).padStart(priceWidth, ' ');
      commands.push(this.getBytes(`${name} ${qty} ${price}\n`));
      if (item.serialNumber) {
        commands.push(this.getBytes(`  SN: ${item.serialNumber}\n`));
      }
    }

    commands.push(this.getBytes('-'.repeat(lineWidth) + '\n'));

    // Align Right for Total
    commands.push(new Uint8Array([0x1B, 0x61, 0x02]));
    
    if (data.taxType && data.taxType !== 'none' && data.subTotal !== undefined && data.taxAmount !== undefined) {
      commands.push(this.getBytes(`SUBTOTAL: ${data.currencySymbol}${data.subTotal.toFixed(2)}\n`));
      commands.push(this.getBytes(`TAX (${data.taxType === 'percentage' ? data.taxValue + '%' : 'Fixed'}): ${data.currencySymbol}${data.taxAmount.toFixed(2)}\n`));
    }

    commands.push(new Uint8Array([0x1B, 0x45, 0x01])); // Bold
    commands.push(this.getBytes(`TOTAL: ${data.currencySymbol}${data.totalAmount.toFixed(2)}\n`));
    commands.push(new Uint8Array([0x1B, 0x45, 0x00])); // Bold off

    // Align Center for Footer
    commands.push(new Uint8Array([0x1B, 0x61, 0x01]));
    commands.push(this.getBytes('\n'));
    if (data.receiptMessage) commands.push(this.getBytes(data.receiptMessage + '\n'));
    
    // Store Account Details
    if (data.printStoreAccountOnReceipt && (data.bankName || data.accountNameDetails || data.accountNumber)) {
      commands.push(this.getBytes('\n--- PAYMENT DETAILS ---\n'));
      if (data.bankName) commands.push(this.getBytes(`Bank: ${data.bankName}\n`));
      if (data.accountNameDetails) commands.push(this.getBytes(`Name: ${data.accountNameDetails}\n`));
      if (data.accountNumber) commands.push(this.getBytes(`Number: ${data.accountNumber}\n`));
    }

    commands.push(this.getBytes('\n\n\n'));

    // Cut Paper
    commands.push(new Uint8Array([0x1D, 0x56, 0x41, 0x10]));

    // Calculate total length
    const totalLength = commands.reduce((acc, curr) => acc + curr.length, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const cmd of commands) {
      result.set(cmd, offset);
      offset += cmd.length;
    }

    return result;
  }

  public isBluetoothSupported(): boolean {
    const nav = navigator as any;
    return !!(nav && nav.bluetooth);
  }

  public async getAvailableDevices(): Promise<any[]> {
    const nav = navigator as any;
    if (nav.bluetooth && nav.bluetooth.getDevices) {
      try {
        return await nav.bluetooth.getDevices();
      } catch (e) {
        console.error('Error getting bonded devices:', e);
        return [];
      }
    }
    return [];
  }

  public async requestDevice(): Promise<any> {
    const nav = navigator as any;
    if (!this.isBluetoothSupported()) {
      throw new Error('Web Bluetooth is not supported on this browser.');
    }

    const device = await nav.bluetooth.requestDevice({
      filters: [
        { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }
      ],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });

    return device;
  }

  public async connectToDevice(deviceOrId: any): Promise<void> {
    try {
      let device = deviceOrId;
      if (typeof deviceOrId === 'string') {
        const devices = await this.getAvailableDevices();
        device = devices.find(d => d.id === deviceOrId);
        if (!device) throw new Error('Printer not found in paired devices.');
      }

      console.log('Connecting to printer:', device.name);
      const server = await device.gatt?.connect();
      if (!server) throw new Error('Failed to connect to GATT server');

      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      this.currentCharacteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
      this.currentDevice = device;

      // Track disconnection
      device.addEventListener('gattserverdisconnected', () => {
        console.log('Printer disconnected');
        this.currentDevice = null;
        this.currentCharacteristic = null;
      });
    } catch (error) {
      this.currentDevice = null;
      this.currentCharacteristic = null;
      throw error;
    }
  }

  public disconnect(): void {
    if (this.currentDevice && this.currentDevice.gatt?.connected) {
      this.currentDevice.gatt.disconnect();
    }
    this.currentDevice = null;
    this.currentCharacteristic = null;
  }

  public async printViaBluetooth(data: Uint8Array, preferredDeviceId?: string): Promise<void> {
    const nav = navigator as any;
    if (!this.isBluetoothSupported()) {
      throw new Error('Web Bluetooth is not supported on this browser. Please try using the "Android Print Service" method instead, or open the app in a new tab.');
    }

    try {
      // Reconnect if needed
      if (!this.currentCharacteristic || !this.currentDevice?.gatt?.connected) {
        if (preferredDeviceId) {
          await this.connectToDevice(preferredDeviceId);
        } else {
          const device = await this.requestDevice();
          await this.connectToDevice(device);
        }
      }

      if (!this.currentCharacteristic) {
        throw new Error('Printer connection lost. Please reconnect.');
      }

      // Send data in chunks of 512 bytes
      const chunkSize = 512;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await this.currentCharacteristic.writeValue(chunk);
      }
    } catch (error: any) {
      console.error('Bluetooth printing error:', error);
      
      // Handle specific "not supported on this platform" error from Chrome
      if (error.message?.includes('not supported on this platform')) {
        throw new Error('Web Bluetooth is supported by your browser, but not enabled on your operating system or hardware. Please try the "Android Print Service" method instead.');
      }
      
      // Handle iframe permission issues
      if (error.name === 'SecurityError' || error.message?.includes('Permissions-Policy')) {
        throw new Error('Bluetooth access was denied. Try opening the app in a new tab to bypass iframe restrictions.');
      }

      throw error;
    }
  }

  public printViaDeepLink(data: Uint8Array): void {
    // Convert Uint8Array to base64
    const binary = Array.from(data).map(b => String.fromCharCode(b)).join('');
    const base64 = btoa(binary);
    
    // Use rawbt: scheme which is often more reliable for custom schemes in Capacitor
    const url = `rawbt:base64:${base64}`;
    
    if (Capacitor.isNativePlatform()) {
      // For Capacitor on Android, try window.location.href first as it's often handled better for custom schemes
      // If that doesn't work, window.open with _system is the fallback
      try {
        window.location.href = url;
      } catch (e) {
        window.open(url, '_system');
      }
    } else {
      window.location.href = url;
    }
  }

  public printViaBrowser(data: PrintData, paperSize: '58mm' | '80mm' | 'thermal' | 'a4' | 'a2'): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Could not open print window. Please allow popups.');
    }

    const isThermal = paperSize === 'thermal' || paperSize === '58mm' || paperSize === '80mm';
    const width = paperSize === '58mm' ? '58mm' : (paperSize === '80mm' || paperSize === 'thermal') ? '80mm' : paperSize === 'a4' ? '210mm' : '420mm';
    
    const itemsHtml = data.items.map(item => `
      <tr>
        <td style="padding: 4px 0;">
          ${item.productName}
          ${item.serialNumber ? `<br/><small style="color: #666;">SN: ${item.serialNumber}</small>` : ''}
        </td>
        <td style="text-align: center; padding: 4px 0;">${item.quantity}</td>
        <td style="text-align: right; padding: 4px 0;">${data.currencySymbol}${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${data.receiptId || 'New Sale'}</title>
          <style>
            @page {
              size: ${isThermal ? width + ' auto' : paperSize.toUpperCase()};
              margin: ${isThermal ? '0' : '10mm'};
            }
            body {
              font-family: 'Inter', -apple-system, system-ui, sans-serif;
              margin: 0;
              padding: ${isThermal ? '10px' : '0'};
              width: ${isThermal ? `calc(${width} - 20px)` : '100%'};
              color: #000;
              font-size: ${isThermal ? '12px' : '14px'};
            }
            .header { text-align: center; margin-bottom: 20px; }
            .store-name { font-size: ${isThermal ? '18px' : '24px'}; font-weight: bold; margin-bottom: 4px; }
            .store-info { font-size: ${isThermal ? '10px' : '12px'}; color: #444; }
            .receipt-info { margin-bottom: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
            .receipt-info p { margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { text-align: left; border-bottom: 1px solid #000; padding: 8px 0; }
            .totals { text-align: right; margin-top: 20px; border-top: 1px solid #000; padding-top: 10px; }
            .total-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 4px; }
            .grand-total { font-size: ${isThermal ? '16px' : '20px'}; font-weight: bold; margin-top: 8px; }
            .footer { text-align: center; margin-top: 40px; font-style: italic; font-size: 11px; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="store-name">${data.storeName}</div>
            <div class="store-info">
              ${data.storeAddress ? `<div>${data.storeAddress}</div>` : ''}
              ${data.phoneNumber ? `<div>Tel: ${data.phoneNumber}</div>` : ''}
            </div>
          </div>

          <div class="receipt-info">
            ${data.receiptId ? `<p><strong>Receipt ID:</strong> ${data.receiptId}</p>` : ''}
            <p><strong>Date:</strong> ${data.date.toLocaleString()}</p>
            <p><strong>Payment:</strong> ${data.paymentMethod}</p>
            ${data.accountName ? `<p><strong>Attendant was:</strong> ${data.accountName}</p>` : ''}
            ${data.customerName ? `<p><strong>Customer:</strong> ${data.customerName}</p>` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals">
            ${data.taxType && data.taxType !== 'none' && data.subTotal !== undefined && data.taxAmount !== undefined ? `
              <div class="total-row">
                <span>Subtotal:</span>
                <span>${data.currencySymbol}${data.subTotal.toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span>Tax (${data.taxType === 'percentage' ? data.taxValue + '%' : 'Fixed'}):</span>
                <span>${data.currencySymbol}${data.taxAmount.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="total-row grand-total">
              <span>TOTAL:</span>
              <span>${data.currencySymbol}${data.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div class="footer">
            ${data.receiptMessage ? `<div>${data.receiptMessage}</div>` : ''}
            <div style="margin-top: 10px;">Thank you for your business!</div>
          </div>

          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }

  public async printViaAndroid(data: Uint8Array): Promise<void> {
    /**
     * NOTE: This method is primarily used for "Share/Save Receipt" and triggers the system share dialog.
     * It is NOT intended for direct Bluetooth thermal printing. 
     * For direct Bluetooth printing in APKs, use printerService.printReceipt instead.
     */
    // Android Support method: Uses a combination of deep links and system sharing
    // This is most compatible for APK environments
    
    // Convert Uint8Array to base64
    const binary = Array.from(data).map(b => String.fromCharCode(b)).join('');
    const base64 = btoa(binary);

    if (Capacitor.isNativePlatform()) {
      try {
        // More robust for APK: Save to cache and share
        const fileName = `receipt_${Date.now()}.bin`;
        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: base64, // Filesystem.writeFile expects base64 string
          directory: Directory.Cache
        });

        await Share.share({
          title: 'Print Receipt',
          url: savedFile.uri,
        });
        return;
      } catch (e) {
        console.warn('Capacitor Share failed, falling back to deep link', e);
      }
    } else if (navigator.share) {
      try {
        const blob = new Blob([data.buffer as any], { type: 'application/octet-stream' });
        const file = new File([blob], 'receipt.bin', { type: 'application/octet-stream' });
        await navigator.share({
          files: [file],
          title: 'Print Receipt',
        });
        return;
      } catch (e) {
        console.warn('Web Share failed', e);
      }
    }

    // Fallback: RawBT intent or similar print app protocol
    const url = `rawbt:base64:${base64}`;
    if (Capacitor.isNativePlatform()) {
      window.location.href = url;
    } else {
      window.open(url, '_system');
    }
  }
}

export const receiptPrinter = new ReceiptPrinter();

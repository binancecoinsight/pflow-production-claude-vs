import { CapacitorThermalPrinter, BluetoothDevice } from 'capacitor-thermal-printer';
import { Capacitor } from '@capacitor/core';

export interface ReceiptItem {
  name: string;
  price: number;
  qty: number;
  total: number;
}

export interface ReceiptData {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  orderId: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  discount: number;
  grandTotal: number;
  receivedAmount?: number;
  changeAmount?: number;
  customerName?: string;
  footerMessage?: string;
}

export interface PrinterDevice {
  name: string;
  address: string;
}

class PrinterService {
  private isConnected: boolean = false;
  private currentDevice: PrinterDevice | null = null;
  private lineLength: number = 32; // Default for 58mm printer

  constructor() {
    this.checkPluginAvailability();
  }

  private checkPluginAvailability() {
    if (!this.isWeb()) {
      if (!CapacitorThermalPrinter) {
        console.error('PrinterService: CapacitorThermalPrinter plugin is NOT loaded! Check your installation.');
      } else {
        console.log('PrinterService: CapacitorThermalPrinter plugin is loaded and ready.');
      }
    }
  }

  private isWeb(): boolean {
    return Capacitor.getPlatform() === 'web';
  }

  isSupported(): boolean {
    return !this.isWeb();
  }

  async scanBluetoothDevices(): Promise<PrinterDevice[]> {
    if (this.isWeb()) {
      console.warn('Bluetooth printing is only supported on Android/iOS devices.');
      return [];
    }

    console.log('PrinterService: Starting Bluetooth scan...');
    return new Promise((resolve, reject) => {
      let devices: BluetoothDevice[] = [];
      let timeoutId: any;
      
      const handler = CapacitorThermalPrinter.addListener('discoverDevices', (data: { devices: BluetoothDevice[] }) => {
        console.log('PrinterService: Devices discovered:', data.devices.length);
        devices = data.devices;
      });

      CapacitorThermalPrinter.startScan()
        .then(() => {
          console.log('PrinterService: Scan started successfully. Waiting 5 seconds...');
          // Scan for 5 seconds
          timeoutId = setTimeout(async () => {
            try {
              console.log('PrinterService: Stopping scan...');
              await CapacitorThermalPrinter.stopScan();
              (await handler).remove();
            } catch (e) {
              console.error('PrinterService: Stop scan error:', e);
            }
            console.log('PrinterService: Scan complete. Found', devices.length, 'devices');
            resolve(devices.map((d: BluetoothDevice) => ({ name: d.name || 'Unknown Device', address: d.address })));
          }, 5000);
        })
        .catch(err => {
          console.error('PrinterService: startScan error:', err);
          if (timeoutId) clearTimeout(timeoutId);
          handler.then(h => h.remove()).catch(() => {});
          reject(new Error(`Failed to start Bluetooth scan: ${err.message || 'Unknown error'}. Please enable Bluetooth and Location permissions.`));
        });
    });
  }

  async connect(address: string): Promise<boolean> {
    if (this.isWeb()) return false;

    try {
      // If already connected to a DIFFERENT device, disconnect first
      if (this.isConnected && this.currentDevice?.address !== address) {
        console.log('PrinterService: Switching printers, disconnecting from previous device first');
        await this.disconnect();
      }

      console.log('PrinterService: Connecting to:', address);
      const device = await CapacitorThermalPrinter.connect({ address });
      this.isConnected = !!device;
      if (device) {
        this.currentDevice = { name: device.name || 'Connected Printer', address: device.address };
      }
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      this.currentDevice = null;
      console.error('Connection failed:', error);
      throw new Error('Printer connection failed. Please check if the device is on and nearby.');
    }
  }

  async disconnect(): Promise<void> {
    if (this.isWeb()) return;

    try {
      await CapacitorThermalPrinter.disconnect();
      this.isConnected = false;
      this.currentDevice = null;
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  getConnectivityStatus(): boolean {
    return this.isConnected;
  }

  isConnectedTo(address: string): boolean {
    return this.isConnected && this.currentDevice?.address === address;
  }

  /**
   * Truncates or pads strings to fit the line length
   */
  private formatLine(left: string, right: string): string {
    const spaceCount = this.lineLength - (left.length + right.length);
    if (spaceCount < 1) {
      const availableForLeft = this.lineLength - right.length - 1;
      return left.substring(0, availableForLeft) + ' ' + right;
    }
    return left + ' '.repeat(spaceCount) + right;
  }

  /**
   * Prunes text to fit 58mm line (32 chars)
   */
  private pruneText(text: string, length: number = 32): string {
    if (text.length <= length) return text;
    return text.substring(0, length - 3) + '...';
  }

  async printReceipt(data: ReceiptData, currencySymbol: string = 'Rs'): Promise<void> {
    if (this.isWeb()) {
      throw new Error('Bluetooth printing is only supported on mobile devices.');
    }

    if (!CapacitorThermalPrinter) {
      throw new Error('Thermal Printer plugin not loaded. Please restart the app or reinstall.');
    }

    try {
      const isActuallyConnected = await CapacitorThermalPrinter.isConnected();
      if (!isActuallyConnected) {
        throw new Error('Printer not connected.');
      }
    } catch (e) {
      console.error('PrinterService: isConnected check failed:', e);
      throw new Error('Printer connection status unknown. Try reconnecting.');
    }

    try {
      // Initialize printer and clear formatting
      CapacitorThermalPrinter.begin();

      // Header
      CapacitorThermalPrinter
        .align('center')
        .bold(true)
        .text(`${data.shopName}\n`)
        .bold(false)
        .text(`${this.pruneText(data.shopAddress)}\n`)
        .text(`Phone: ${data.shopPhone}\n`)
        .text(`${'-'.repeat(this.lineLength)}\n`);

      // Order Info
      CapacitorThermalPrinter.align('left');
      CapacitorThermalPrinter.text(this.formatLine(`Order: #${data.orderId}`, data.date) + '\n');
      if (data.customerName) {
        CapacitorThermalPrinter.text(`Customer: ${this.pruneText(data.customerName, 20)}\n`);
      }
      CapacitorThermalPrinter.text(`${'-'.repeat(this.lineLength)}\n`);

      // Items Header
      CapacitorThermalPrinter.text(this.formatLine('Item(Qty/Price)', 'Total') + '\n');
      CapacitorThermalPrinter.text(`${'.'.repeat(this.lineLength)}\n`);

      // Items
      for (const item of data.items) {
        const itemLine1 = `${this.pruneText(item.name, this.lineLength)}`;
        const details = `${item.qty}x${currencySymbol}${item.price.toFixed(2)}`;
        const total = `${currencySymbol}${item.total.toFixed(2)}`;
        
        CapacitorThermalPrinter.text(`${itemLine1}\n`);
        CapacitorThermalPrinter.text(this.formatLine(`  ${details}`, total) + '\n');
      }

      CapacitorThermalPrinter.text(`${'-'.repeat(this.lineLength)}\n`);

      // Totals
      CapacitorThermalPrinter.text(this.formatLine('Subtotal:', `${currencySymbol}${data.subtotal.toFixed(2)}`) + '\n');
      if (data.discount > 0) {
        CapacitorThermalPrinter.text(this.formatLine('Discount:', `-${currencySymbol}${data.discount.toFixed(2)}`) + '\n');
      }
      if (data.tax > 0) {
        CapacitorThermalPrinter.text(this.formatLine('Tax:', `${currencySymbol}${data.tax.toFixed(2)}`) + '\n');
      }
      
      CapacitorThermalPrinter.bold(true);
      CapacitorThermalPrinter.text(this.formatLine('GRAND TOTAL:', `${currencySymbol}${data.grandTotal.toFixed(2)}`) + '\n');
      CapacitorThermalPrinter.bold(false);

      if (data.receivedAmount !== undefined) {
        CapacitorThermalPrinter.text(this.formatLine('Received:', `${currencySymbol}${data.receivedAmount.toFixed(2)}`) + '\n');
        CapacitorThermalPrinter.text(this.formatLine('Change:', `${currencySymbol}${(data.changeAmount || 0).toFixed(2)}`) + '\n');
      }

      CapacitorThermalPrinter.text(`${'-'.repeat(this.lineLength)}\n`);
      
      // Footer
      CapacitorThermalPrinter.align('center');
      if (data.footerMessage) {
        CapacitorThermalPrinter.text(`${data.footerMessage}\n`);
      }
      CapacitorThermalPrinter.text("Thank you for visiting!\n");
      
      // Barcode (Order ID)
      CapacitorThermalPrinter
        .barcodeHeight(60)
        .barcodeWidth(3)
        .barcode('CODE128', data.orderId)
        .text('\n');

      // Feed and Cut
      CapacitorThermalPrinter.feedCutPaper(false);
      
      // Final write
      await CapacitorThermalPrinter.write();
      
    } catch (error) {
      console.error('Print failed:', error);
      throw new Error('Printing failed. Please check printer connection and paper.');
    }
  }
}

export const printerService = new PrinterService();

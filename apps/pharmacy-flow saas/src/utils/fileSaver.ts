import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function saveFile(fileName: string, data: Blob | string, mimeType: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      let base64Data: string;
      if (typeof data === 'string') {
        base64Data = btoa(unescape(encodeURIComponent(data)));
      } else {
        base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(data);
        });
      }

      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true
      });

      await Share.share({
        title: fileName,
        text: `Here is your file: ${fileName}`,
        url: result.uri,
        dialogTitle: 'Save or Share File',
      });
    } catch (error) {
      console.error('Error saving file natively:', error);
      throw error;
    }
  } else {
    // Web fallback
    const blob = typeof data === 'string' ? new Blob([data], { type: mimeType }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

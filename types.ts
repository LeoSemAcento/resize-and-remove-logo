export type ProcessingStatus = 'waiting' | 'compositing' | 'processing' | 'done' | 'error';

export interface ImageFile {
  id: string;
  file: File;
  originalBase64: string;
  processedBase64?: string;
  status: ProcessingStatus;
  error?: string;
  name: string;
}

export type AspectRatio = '16:9' | '9:16' | 'Original';
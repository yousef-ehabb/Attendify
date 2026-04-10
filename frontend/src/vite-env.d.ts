/**
 * Type declarations for browser APIs not covered by the default
 * TypeScript lib definitions.
 */

interface BarcodeDetectorFormat {
  format: string;
}

interface DetectedBarcode {
  readonly boundingBox: DOMRectReadOnly;
  readonly rawValue: string;
  readonly cornerPoints: readonly { x: number; y: number }[];
  readonly format: string;
}

interface BarcodeDetector {
  detect(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<DetectedBarcode[]>;
  getSupportedFormats(): Promise<string[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

declare var BarcodeDetector: BarcodeDetectorConstructor;

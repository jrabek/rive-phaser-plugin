import Rive, { Artboard, File, RiveCanvas } from "@rive-app/canvas-advanced-single";

export class RiveObjectFactory {
  private static rive?: RiveCanvas;
  private static rivePromise?: Promise<RiveCanvas>;
  private static factoryMap = new Map<string, RiveObjectFactory>();
  private file: File;
  private key: string;

  constructor(key: string, file: File) {
    this.file = file;
    this.key = key;
  }

  static async awaitRuntime(): Promise<RiveCanvas> {
    if (this.rive) {
      return this.rive;
    }
    if (!this.rivePromise) {
      this.rivePromise = Rive();
      this.rive = await this.rivePromise;
    }

    return this.rivePromise;
  }

  static getRuntime(): RiveCanvas {
    if (this.rive) {
      return this.rive;
    } else {
      throw new Error("Rive runtime not loaded yet");
    }
  }

  static async processRivFile(key: string, buffer: Uint8Array): Promise<void> {
    if (this.factoryMap.has(key)) {
      console.warn("Already processed", { rivFileKey: key });
      return;
    }
    const rive = await this.awaitRuntime();
    const file = await rive.load(buffer);
    const factoryInstance = new RiveObjectFactory(key, file);
    if (this.factoryMap.has(key)) {
      console.warn("Race when processing", { rivFileKey: key });
    }
    this.factoryMap.set(key, factoryInstance);
  }

  static getFactory(key: string): RiveObjectFactory | undefined {
    const factory = this.factoryMap.get(key);
    if (!factory) {
      console.warn("No rive factory for key", key);
    }
    return factory;
  }

  getArtboard(artboardName?: string): Artboard | undefined {
    let artboard: Artboard;
    if (artboardName) {
      artboard = this.file.artboardByName(artboardName);
    } else {
      artboard = this.file.defaultArtboard();
    }
    if (!artboard) {
      console.warn(`Unknown artboard ${artboardName} in ${this.key}`);
    }
    return artboard;
  }
}
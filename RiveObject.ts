import { Artboard, CanvasRenderer, RiveCanvas, StateMachineInstance, SMIInput, Fit, Alignment, LinearAnimationInstance } from "@rive-app/canvas-advanced-single";
import { RiveObjectFactory } from "./RiveObjectFactory";

export enum RiveEvent {
  Play = "Play",
  Pause = "Pause",
  Loop = "Loop",
  Stop = "Stop"
}

/** 
 * For guidance:
 *  https://codesandbox.io/s/rive-canvas-advanced-api-centaur-example-exh2os?file=/src/index.ts:3259-3269
 *  https://github.com/rive-app/rive-wasm/blob/744f0c1571ddc86ecaa48a2fa4c6b006396dbf1e/js/src/rive.ts
 */

export class RiveObject extends Phaser.GameObjects.Extern {
  private delta = 0;
  private artboard?: Artboard;
  private rive: RiveCanvas;
  private canvasRenderer?: CanvasRenderer;
  private animate?: ((delta: number) => void);
  private stateMachine?: StateMachineInstance;
  private loaded = false;
  private canvasTexture?: Phaser.Textures.CanvasTexture;
  private inputMap = new Map<string, SMIInput>();
  private fit: Fit;
  private alignment: Alignment;
  private factory: RiveObjectFactory;
  private animationName?: string;

  constructor(scene: Phaser.Scene, key: string, x?: number, y?: number, artboard?: string, stateMachine?: string) {
    super(scene);
    this.setOrigin();
    this.x = x ?? 0;
    this.y = y ?? 0;

    const factory = RiveObjectFactory.getFactory(key);
    if (factory) {
      this.factory = factory;
      this.setArtboardByName(artboard);
      this.setStateMachineByName(stateMachine);
    } else {
      throw new Error(`Unknown rive file ${key}`);
    }

    const rive = RiveObjectFactory.getRuntime();
    this.fit = rive.Fit.contain;
    this.alignment = rive.Alignment.center;
    this.rive = rive;
  }

  preDestroy(): void {
    this.reset();
  }

  private reset(): void {
    this.loaded = false;
    if (this.canvasTexture) {
      this.canvasTexture.destroy();
      this.canvasTexture = undefined;
    }
    this.animate = undefined;
    if (this.artboard) {
      this.artboard.delete();
      this.artboard = undefined;
    }
    this.canvasRenderer = undefined;

    if (this.stateMachine) {
      this.inputMap.clear();
      this.stateMachine.delete();
      this.stateMachine = undefined;
    }
  }

  setArtboardByName(artboardName?: string): void {
    this.setArtboard(this.factory.getArtboard(artboardName));
  }

  private setArtboard(artboard?: Artboard): void {
    if (!artboard || this.artboard === artboard) {
      return;
    }

    this.reset();

    this.artboard = artboard;

    const { minX, minY, maxX, maxY } = artboard.bounds;
    const width = maxX - minX;
    const height = maxY - minY;
    this.setSize(width, height);

    console.log("setArtboard", { width, height });

    const rive = RiveObjectFactory.getRuntime();
    const canvasKey = "RiveObjectCanvas-" + Math.random();
    this.canvasTexture = this.scene.textures.createCanvas(canvasKey, this.width, this.height);
    this.canvasRenderer = rive.makeRenderer(this.canvasTexture.canvas, false);

    this.loaded = true;
  }

  get scaledHeight(): number {
    return this.scaleY * this.height;
  }

  set scaledHeight(value: number) {
    this.scaleY = value / this.height;
  }

  get scaledWidth(): number {
    return this.scaleX * this.width;
  }

  set scaledWidth(value: number) {
    this.scaleX = value / this.width;
  }

  set debug(value: boolean) {
    if (value) {
      const pos = this.canvasPosition();
      const graphics = new Phaser.GameObjects.Graphics(this.scene);
      this.scene.add.existing(graphics);
      graphics.lineStyle(5, Math.random() * 0xffffff);
      graphics.strokeRect(pos.x, pos.y, this.scaledWidth, this.scaledHeight);
    }
  }

  setStateMachineByName(stateMachineName?: string): void {
    if (!this.artboard) {
      return;
    }

    let stateMachine: StateMachineInstance | undefined;
    if (stateMachineName) {
      stateMachine = this.artboard.stateMachineByName(stateMachineName);
    } else {
      stateMachine = this.artboard.stateMachineByIndex(0);
    }

    if (stateMachine) {
      const rive = RiveObjectFactory.getRuntime();
      const stateMachineInstance = new rive.StateMachineInstance(stateMachine, this.artboard);
      this.setStateMachine(stateMachineInstance);
    } else if (stateMachineName) {
      console.warn("Unknown state machine", { stateMachineName });
    }
  }

  private setStateMachine(stateMachine: StateMachineInstance): void {
    if (this.stateMachine) {
      if (this.stateMachine === stateMachine) {
        return;
      }
      this.inputMap.clear();
      this.stateMachine.delete();
      this.stateMachine = undefined;
    }

    this.stateMachine = stateMachine;
    for (let inputIndex = 0; inputIndex < stateMachine.inputCount(); inputIndex++) {
      const input = stateMachine.input(inputIndex);
      this.inputMap.set(input.name, input);
    }
  }

  private pointToArtboardSpace(globalX: number, globalY: number): Phaser.Math.Vector2 | undefined {
    const rive = this.rive;
    if (!rive) {
      return;
    }
    const artboard = this.artboard;
    if (!artboard) {
      return;
    }

    const localPoint = this.getLocalPoint(globalX, globalY);

    const forwardMatrix = rive.computeAlignment(
      this.fit,
      this.alignment,
      {
        minX: 0,
        minY: 0,
        maxX: this.width,
        maxY: this.height,
      },
      artboard.bounds
    );
    const invertedMatrix = new rive.Mat2D();
    forwardMatrix.invert(invertedMatrix);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const canvasCoordinatesVector = new rive.Vec2D(localPoint.x, localPoint.y);
    const transformedVector = rive.mapXY(
      invertedMatrix,
      canvasCoordinatesVector
    );
    // TODO: Remove when rive fixes the Vec2D type
    const transformedX = <number><unknown>transformedVector.x();
    const transformedY = <number><unknown>transformedVector.y();

    return new Phaser.Math.Vector2(transformedX, transformedY);
  }

  setInteractive(): typeof this {
    super.setInteractive()
      .on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        const point = this.pointToArtboardSpace(pointer.x, pointer.y);
        if (point) {
          //console.log("POINTER_DOWN", point.x, point.y);
          this.stateMachine?.pointerDown(point.x, point.y);
        }
      })
      .on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
        const point = this.pointToArtboardSpace(pointer.x, pointer.y);
        if (point) {
          //console.log("POINTER_UP", point.x, point.y);
          this.stateMachine?.pointerUp(point.x, point.y);
        }
      })
      .on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
        const point = this.pointToArtboardSpace(pointer.x, pointer.y);
        if (point) {
          //console.log("POINTER_MOVE", point.x, point.y);
          this.stateMachine?.pointerMove(point.x, point.y);
        }
      });
    return this;
  }

  play(animationName?: string): void {
    const artboard = this.artboard;
    if (!artboard) {
      console.warn("No artboard loaded.  Cannot play ", animationName);
      return;
    }

    let animation: LinearAnimationInstance | undefined;
    if (!animationName) {
      animation = artboard.animationByIndex(0);
    } else {
      animation = artboard.animationByName(animationName);
    }

    if (!animation) {
      console.warn("No animation with name", { animationName });
      return;
    }

    const rive = RiveObjectFactory.getRuntime();
    const instance = new rive.LinearAnimationInstance(animation, artboard);
    this.animate = (delta: number) => {
      instance.advance(delta);
      instance.apply(1.0);
    };
    this.animate(0);

    this.animationName = animationName;
    this.emit(RiveEvent.Play, { animationName });

    this.requestAnimationFrame();
  }

  stop(): void {
    const animationName = this.animationName;
    this.emit(RiveEvent.Stop, { animationName });
  }

  private getInput(name: string): SMIInput | undefined {
    const input = this.inputMap.get(name);
    if (!input) {
      console.warn("No state machine input with name", { name });
    }
    return input;
  }

  fireTrigger(name: string): void {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return;
    }
    const input = this.getInput(name);
    if (!input) {
      return;
    }
    if (input.type !== SMIInput.trigger) {
      console.warn("input is not a trigger", { name, type: input.type });
      return;
    }
    input.fire();
  }

  setBoolean(name: string, value: boolean): void {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return;
    }
    const input = this.getInput(name);
    if (!input) {
      return;
    }
    if (input.type !== SMIInput.bool) {
      console.warn("input is not a bool", { name, type: input.type });
      return;
    }
    input.value = value;
  }

  setNumber(name: string, value: number): void {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return;
    }
    const input = this.getInput(name);
    if (!input) {
      return;
    }
    if (input.type !== SMIInput.number) {
      console.warn("input is not a number", { name, type: input.type });
      return;
    }
    input.value = value;
  }

  preUpdate(time: number, delta: number): void {
    this.delta = delta / 1000;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  renderCanvas(renderer: Phaser.Renderer.Canvas.CanvasRenderer, camera: Phaser.Cameras.Scene2D.Camera, calcMatrix: Phaser.Math.Matrix4): void {
    if (!this.loaded || this.delta === 0) {
      console.log("Not rendering", { loaded: this.loaded, delta: this.delta });
      return;
    }
    const rive = this.rive;
    const artboard = this.artboard;
    const animate = this.animate;
    const stateMachine = this.stateMachine;
    const activeAnimation = !!(animate || stateMachine);
    const canvas = this.canvasTexture?.canvas;
    if (!rive || !artboard || !canvas || !activeAnimation) {
      console.log("Not rendering", { rive, artboard, canvasElement: canvas, activeAnimation });
      return;
    }

    const riveRenderer = this.canvasRenderer;
    if (!riveRenderer) {
      console.log("Not rendering", { riveRenderer });
      return;
    }
    riveRenderer.clear();
    this.stateMachine?.advance(this.delta);
    animate?.(this.delta);
    artboard.advance(this.delta);
    this.delta = 0;
    riveRenderer.save();
    riveRenderer.align(this.fit, this.alignment, {
      minX: 0,
      minY: 0,
      maxX: this.scaledWidth,
      maxY: this.scaledHeight
    }, artboard.bounds);
    artboard.draw(riveRenderer);
    const dctx = renderer.currentContext;
    const pos = this.canvasPosition();
    dctx.drawImage(canvas, pos.x, pos.y);
    riveRenderer.restore();
    riveRenderer.flush();
  }

  private canvasPosition(): Phaser.Math.Vector2 {
    const x = this.x - this.originX * this.scaledWidth;
    const y = this.y - this.originY * this.scaledHeight;
    return new Phaser.Math.Vector2(x, y);
  }

  private draw(/*elapsedTime: number*/): void {
    this.requestAnimationFrame();
  }

  private requestAnimationFrame() {
    this.rive.requestAnimationFrame(this.draw.bind(this));
  }
}

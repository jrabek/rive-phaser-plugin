import { RiveObject } from "./RiveObject";

export default function registerRiveFactory(): void {
  Phaser.GameObjects.GameObjectFactory.register("rive",
    function (this: Phaser.GameObjects.GameObjectFactory, key: string, x?: number, y?: number, artboard?: string, stateMachine?: string) {
      return this.displayList.add(new RiveObject(this.scene, key, x, y, artboard, stateMachine));
    });
}
import { RiveObject } from "./RiveObject";

declare namespace Phaser.GameObjects {

    export interface GameObjectFactory {
        rive(x: number, y: number, width: number, height: number): RiveObject;
    }
}
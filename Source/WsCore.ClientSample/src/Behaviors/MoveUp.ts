import { Behavior } from './Behavior';




export class MoveUp extends Behavior {
    speed: number;

    constructor(speed: number) {
        super();
        this.speed = speed;
    }

    onTick(dt: any): void {
        if (!this.isEnabled) return;
        this.object3d.position.y += this.speed * dt;
    }
}

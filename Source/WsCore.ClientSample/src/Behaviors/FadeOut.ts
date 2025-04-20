import * as THREE from 'three';
import { Behavior } from './Behavior';


export class FadeOut extends Behavior {

    duration = 1;
    phase = 1;
    destroyOnFade = false;

    constructor(duration, destroyOnFade = false) {
        super();

        this.duration = duration;
        this.phase = duration;
        this.destroyOnFade = destroyOnFade;
    }

    restart() {
        this.phase = this.duration;
    }

    onTick(dt: any): void {
        if (!this.isEnabled) return;

        if (this.phase > 0) {
            this.phase -= dt;

            const mat = (<any>this.object3d).material as THREE.Material;
            if (mat != undefined && mat.opacity != null) {
                mat.opacity = this.phase / this.duration;
            }
        } else if (this.destroyOnFade) {
            this.isEnabled = false;
            this.object3d.parent?.remove(this.object3d);
            const mat = (<any>this.object3d).material as THREE.Material;
            if (mat != undefined) {
                const texture = (<any>mat).map as THREE.Texture;
                if (texture) {
                    texture.dispose();
                }
                mat.dispose();
            }
        }
    }
}

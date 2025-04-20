import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { Behavior } from "./Behavior";

export class TweenBehavior extends Behavior {
    private activeTweens: Map<string, Tween<any>>;
    
    constructor() {
        super();
        this.activeTweens = new Map();
    }

    onTick(dt: number): void {
        if (!this.isEnabled) return;
        
        this.activeTweens.forEach(tween => {
            tween.update();
        });

        this.activeTweens.forEach((tween, id) => {
            if (tween.isPlaying() === false) {
                this.activeTweens.delete(id);
            }
        });
    }

    private generateTweenId(): string {
        return Math.random().toString(36).substr(2, 9);
    }

    animate(props: {
        from?: any,
        to: any,
        duration?: number,
        delay?: number,
        easing?: (k: number) => number,
        onUpdate?: (obj: any) => void,
        onComplete?: () => void
    }): Promise<void> {
        const tweenId = this.generateTweenId();
        const target = props.from || {};
        
        const tween = new Tween(target)
            .to(props.to, props.duration || 1000)
            .easing(props.easing || Easing.Elastic.Out)
            .delay(props.delay || 0);

        if (props.onUpdate) {
            tween.onUpdate(props.onUpdate);
        }

        this.activeTweens.set(tweenId, tween);

        return new Promise((resolve) => {
            tween.onComplete(() => {
                props.onComplete?.();
                resolve();
            });
            tween.start();
        });
    }

    // Position tweening methods
    moveTo(
        target: THREE.Vector3 | { x: number, y: number, z: number },
        duration: number = 1000,
        easing: (k: number) => number = Easing.Quadratic.Out
    ): Promise<void> {
        const targetPos = target instanceof THREE.Vector3 ? target : new THREE.Vector3(target.x, target.y, target.z);
        const currentPos = this.object3d.position.clone();

        return this.animate({
            from: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
            to: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
            duration,
            easing,
            onUpdate: (obj) => {
                this.object3d.position.set(obj.x, obj.y, obj.z);
            }
        });
    }

    moveToX(
        targetX: number,
        duration: number = 1000,
        easing: (k: number) => number = Easing.Quadratic.Out
    ): Promise<void> {
        return this.animate({
            from: { x: this.object3d.position.x },
            to: { x: targetX },
            duration,
            easing,
            onUpdate: (obj) => {
                this.object3d.position.x = obj.x;
            }
        });
    }

    moveToY(
        targetY: number,
        duration: number = 1000,
        easing: (k: number) => number = Easing.Quadratic.Out
    ): Promise<void> {
        return this.animate({
            from: { y: this.object3d.position.y },
            to: { y: targetY },
            duration,
            easing,
            onUpdate: (obj) => {
                this.object3d.position.y = obj.y;
            }
        });
    }

    moveToZ(
        targetZ: number,
        duration: number = 1000,
        easing: (k: number) => number = Easing.Quadratic.Out
    ): Promise<void> {
        return this.animate({
            from: { z: this.object3d.position.z },
            to: { z: targetZ },
            duration,
            easing,
            onUpdate: (obj) => {
                this.object3d.position.z = obj.z;
            }
        });
    }

    // Rotation tweening methods
    rotateTo(
        target: THREE.Euler | { x: number, y: number, z: number },
        duration: number = 1000,
        easing: (k: number) => number = Easing.Quadratic.Out
    ): Promise<void> {
        const targetRot = target instanceof THREE.Euler 
            ? { x: target.x, y: target.y, z: target.z }
            : target;
        const currentRot = this.object3d.rotation;

        return this.animate({
            from: { x: currentRot.x, y: currentRot.y, z: currentRot.z },
            to: { x: targetRot.x, y: targetRot.y, z: targetRot.z },
            duration,
            easing,
            onUpdate: (obj) => {
                this.object3d.rotation.set(obj.x, obj.y, obj.z);
            }
        });
    }

    rotateToAngle(
        angle: number,
        axis: 'x' | 'y' | 'z' = 'z',
        duration: number = 1000,
        easing: (k: number) => number = Easing.Quadratic.Out
    ): Promise<void> {
        const from = { angle: this.object3d.rotation[axis] };
        const to = { angle };

        return this.animate({
            from,
            to,
            duration,
            easing,
            onUpdate: (obj) => {
                if (axis === 'x') this.object3d.rotation.x = obj.angle;
                else if (axis === 'y') this.object3d.rotation.y = obj.angle;
                else this.object3d.rotation.z = obj.angle;
            }
        });
    }

    // ... (previous methods remain the same: fadeIn, fadeOut, scale, scaleSprite, colorTo, etc.)

    fadeIn(duration: number = 1000, delay: number = 0): Promise<void> {
        if (this.object3d instanceof THREE.Sprite) {
            const spriteMaterial = (this.object3d.material as THREE.SpriteMaterial);
            spriteMaterial.transparent = true;
            spriteMaterial.opacity = 0;

            return this.animate({
                from: { opacity: 0 },
                to: { opacity: 1 },
                duration,
                delay,
                onUpdate: (obj) => {
                    spriteMaterial.opacity = obj.opacity;
                }
            });
        } else if (this.object3d instanceof THREE.Object3D) {
            const materials = this.getMaterials();
            materials.forEach(material => {
                material.transparent = true;
                material.opacity = 0;
            });

            return this.animate({
                from: { opacity: 0 },
                to: { opacity: 1 },
                duration,
                delay,
                onUpdate: (obj) => {
                    materials.forEach(material => {
                        material.opacity = obj.opacity;
                    });
                }
            });
        }
        return Promise.resolve();
    }

    fadeOut(duration: number = 1000, delay: number = 0): Promise<void> {
        if (this.object3d instanceof THREE.Sprite) {
            const spriteMaterial = (this.object3d.material as THREE.SpriteMaterial);
            return this.animate({
                from: { opacity: 1 },
                to: { opacity: 0 },
                duration,
                delay,
                onUpdate: (obj) => {
                    spriteMaterial.opacity = obj.opacity;
                }
            });
        } else if (this.object3d instanceof THREE.Object3D) {
            const materials = this.getMaterials();
            return this.animate({
                from: { opacity: 1 },
                to: { opacity: 0 },
                duration,
                delay,
                onUpdate: (obj) => {
                    materials.forEach(material => {
                        material.opacity = obj.opacity;
                    });
                }
            });
        }
        return Promise.resolve();
    }

    scale(
        targetScale: THREE.Vector3 | number,
        duration: number = 1000,
        easing: (k: number) => number = Easing.Elastic.Out
    ): Promise<void> {
        const target = typeof targetScale === 'number' 
            ? new THREE.Vector3(targetScale, targetScale, targetScale)
            : targetScale;

        const initialScale = this.object3d.scale.clone();
        
        return this.animate({
            from: { x: initialScale.x, y: initialScale.y, z: initialScale.z },
            to: { x: target.x, y: target.y, z: target.z },
            duration,
            easing,
            onUpdate: (obj) => {
                this.object3d.scale.set(obj.x, obj.y, obj.z);
            }
        });
    }

    scaleSprite(
        targetScale: number | { x: number, y: number },
        duration: number = 1000,
        easing: (k: number) => number = Easing.Elastic.Out
    ): Promise<void> {
        if (!(this.object3d instanceof THREE.Sprite)) {
            return Promise.resolve();
        }

        const sprite = this.object3d as THREE.Sprite;
        const initialScale = { x: sprite.scale.x, y: sprite.scale.y };
        const target = typeof targetScale === 'number' 
            ? { x: targetScale, y: targetScale }
            : targetScale;

        return this.animate({
            from: initialScale,
            to: target,
            duration,
            easing,
            onUpdate: (obj) => {
                sprite.scale.set(obj.x, obj.y, 1);
            }
        });
    }

    colorTo(
        targetColor: THREE.Color | string | number,
        duration: number = 1000,
        easing: (k: number) => number = Easing.Linear.None
    ): Promise<void> {
        if (!(this.object3d instanceof THREE.Sprite)) {
            return Promise.resolve();
        }

        const spriteMaterial = (this.object3d.material as THREE.SpriteMaterial);
        const currentColor = spriteMaterial.color;
        const targetColorObj = new THREE.Color(targetColor);

        return this.animate({
            from: { r: currentColor.r, g: currentColor.g, b: currentColor.b },
            to: { r: targetColorObj.r, g: targetColorObj.g, b: targetColorObj.b },
            duration,
            easing,
            onUpdate: (obj) => {
                spriteMaterial.color.setRGB(obj.r, obj.g, obj.b);
            }
        });
    }

    private getMaterials(): THREE.Material[] {
        const materials: THREE.Material[] = [];
        this.object3d.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (Array.isArray(child.material)) {
                    materials.push(...child.material);
                } else {
                    materials.push(child.material);
                }
            }
        });
        return materials;
    }

    stopAll(): void {
        this.activeTweens.forEach(tween => {
            tween.stop();
        });
        this.activeTweens.clear();
    }

    disable(): void {
        super.disable();
        this.stopAll();
    }
}
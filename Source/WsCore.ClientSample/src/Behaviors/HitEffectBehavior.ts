import * as THREE from 'three';
import { Behavior } from './Behavior';

export interface HitEffectOptions {
    duration?: number;     // Duration of the blink in milliseconds
    intensity?: number;    // How intense the red color should be (0-1)
}

export class HitEffectBehavior extends Behavior {
    private options: HitEffectOptions;
    private startTime: number | null = null;
    private originalMaterials: THREE.Material[] = [];
    private instanceMaterials: THREE.Material[] = [];
    private isActive = false;

    constructor(options: HitEffectOptions = {}) {
        super();
        this.options = {
            duration: 200,
            intensity: 0.8,
            ...options
        };
    }

    onAttach(): void {
        this.createUniqueInstanceMaterials();
    }

    onTick(dt: number): void {
        if (!this.isEnabled || !this.isActive || !this.startTime) return;

        const elapsed = Date.now() - this.startTime;
        const progress = Math.min(elapsed / this.options.duration!, 1);

        // Create a flash effect that peaks in the middle
        const intensity = this.options.intensity! * Math.sin(progress * Math.PI);
        
        this.updateMaterials(intensity);

        if (progress >= 1) {
            this.reset();
        }
    }

    private createUniqueInstanceMaterials(): void {
        this.originalMaterials = [];
        this.instanceMaterials = [];

        this.object3d.traverse((child: THREE.Object3D) => {
            if ('material' in child) {
                const materials = Array.isArray(child.material) 
                    ? child.material 
                    : [child.material];
                
                const newMaterials: THREE.Material[] = [];
                
                materials.forEach((material) => {
                    // Store original material reference
                    this.originalMaterials.push(material);
                    
                    // Create a unique instance for this object
                    const instanceMaterial = material.clone();
                    this.instanceMaterials.push(instanceMaterial);
                    newMaterials.push(instanceMaterial);
                });

                // Assign unique material instances to this object
                if ('material' in child) {
                    if (Array.isArray(child.material)) {
                        child.material = newMaterials;
                    } else {
                        child.material = newMaterials[0];
                    }
                }
            }
        });
    }

    private updateMaterials(intensity: number): void {
        this.instanceMaterials.forEach((material) => {
            if (material instanceof THREE.MeshStandardMaterial) {
                material.emissive.setRGB(intensity, 0, 0);
            }
        });
    }

    private restoreOriginalMaterials(): void {
        this.instanceMaterials.forEach((material, index) => {
            if (material instanceof THREE.MeshStandardMaterial) {
                const originalMaterial = this.originalMaterials[index];
                material.emissive.copy((originalMaterial as THREE.MeshStandardMaterial).emissive);
            }
        });
    }

    blink(): void {
        this.startTime = Date.now();
        this.isActive = true;
    }

    private reset(): void {
        this.isActive = false;
        this.startTime = null;
        this.restoreOriginalMaterials();
    }

    disable(): void {
        super.disable();
        this.reset();
        
        // Restore original materials when disabled
        this.object3d.traverse((child: THREE.Object3D) => {
            if ('material' in child) {
                if (Array.isArray(child.material)) {
                    child.material = [...this.originalMaterials];
                } else {
                    child.material = this.originalMaterials[0];
                }
            }
        });
    }
}
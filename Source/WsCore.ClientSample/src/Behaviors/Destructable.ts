import * as THREE from 'three';
import { Behavior } from "./Behavior";

export interface DestructableConfig {
    maxHealth: number;
    isDestroyOnDeath?: boolean;
    onHitEffect?: () => void;
    onDeathEffect?: () => void;
}

export class Destructable extends Behavior {
    private health: number = 100;
    private maxHealth: number = 100;
    private isDestroyed: boolean;
    private isDestroyOnDeath: boolean;
    private onHitEffect?: () => void;
    private onDeathEffect?: () => void;
    private onDeathCallback?: Function;
    private deathResolver?: (value: void | PromiseLike<void>) => void;

    constructor(config: DestructableConfig) {
        super();
        this.maxHealth = config.maxHealth ?? 100;
        this.health = this.maxHealth ?? 100;
        this.isDestroyed = false;
        this.isDestroyOnDeath = config.isDestroyOnDeath ?? false;
        this.onHitEffect = config.onHitEffect;
        this.onDeathEffect = config.onDeathEffect;
    }

    // Register a hit with specific damage
    hit(damage: number): void {
        if (this.isDestroyed || !this.isEnabled) return;

        this.health = Math.max(0, this.health - damage);

        if (this.onHitEffect) {
            this.onHitEffect();
        }

        if (this.health <= 0) {
            this.die();
        }
    }

    // Heal the object
    heal(amount: number): void {
        if (this.isDestroyed || !this.isEnabled) return;
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    // Get current health as a percentage (0-1)
    getHealthPercent(): number {
        return this.health / this.maxHealth;
    }

    // Get current health value
    getHealth(): number {
        return this.health;
    }

    // Check if object is destroyed
    isObjectDestroyed(): boolean {
        return this.isDestroyed;
    }

    // Register death event handler
    onDeath(callback: Function): void {
        this.onDeathCallback = callback;
    }

    // Promise-based death handling
    waitForDeath(): Promise<void> {
        return new Promise(resolve => {
            if (this.isDestroyed) {
                resolve();
            } else {
                this.deathResolver = resolve;
            }
        });
    }

    // Handle death
    private die(): void {
        if (this.isDestroyed) return;
        
        this.isDestroyed = true;

        if (this.onDeathEffect) {
            this.onDeathEffect();
        }

        if (this.onDeathCallback) {
            this.onDeathCallback();
        }

        if (this.deathResolver) {
            this.deathResolver();
        }

        if (this.isDestroyOnDeath && this.object3d) {
            // Remove from parent if it exists
            if (this.object3d.parent) {
                this.object3d.parent.remove(this.object3d);
            }
            // Clean up geometry and materials
            if (this.object3d instanceof THREE.Mesh) {
                if (this.object3d.geometry) {
                    this.object3d.geometry.dispose();
                }
                if (this.object3d.material) {
                    if (Array.isArray(this.object3d.material)) {
                        this.object3d.material.forEach(material => material.dispose());
                    } else {
                        this.object3d.material.dispose();
                    }
                }
            }
        }
    }

    // Reset the object to initial state
    reset(): void {
        this.health = this.maxHealth;
        this.isDestroyed = false;
    }

    // Optional: Implement onTick if you need continuous health effects (like regeneration or damage over time)
    onTick(dt: number): void {
        // Example: Add regeneration or damage over time effects here
    }
}
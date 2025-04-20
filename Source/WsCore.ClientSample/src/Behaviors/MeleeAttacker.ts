import { t } from "../Runtime/stateMachine";
import { Behavior } from "./Behavior";

export interface MeleeAttackerConfig {
    damage: number;
    attackPeriod: number;  // Time between attacks in seconds
    onAttack?: () => void; // Callback for attack animation/effects
}

export class MeleeAttacker extends Behavior {
    private damage: number;
    private attackPeriod: number;
    private lastAttackTime: number = 0;
    private onAttack?: () => void;
    private isAttacking: boolean = false;
    private offset: number = 0;
    attacked: boolean;

    constructor(config: MeleeAttackerConfig) {
        super();
        this.damage = config.damage;
        this.attackPeriod = config.attackPeriod;
        this.onAttack = config.onAttack;
    }

    startAttacking(): void {
        this.isEnabled = true;
        this.isAttacking = true;
        this.lastAttackTime = performance.now() / 1000;
    }

    stopAttacking(): void {
        this.isEnabled = false;
        this.isAttacking = false;
    }

    onTick(dt: number): void {
        if (!this.isEnabled || !this.isAttacking) return;

        const currentTime = performance.now() / 1000;
        if (!this.attacked && currentTime - this.lastAttackTime >= this.attackPeriod + this.offset) {
            this.attacked = true;
            this.performAttack();
        }
        if (currentTime - this.lastAttackTime >= this.attackPeriod) {
            this.lastAttackTime = currentTime;
            this.attacked = false;
        }
    }

    private performAttack(): void {
        if (this.onAttack) {
            this.onAttack();
        }
    }

    // Utility methods
    setAttackPeriod(period: number, offset: number): void {
        this.attackPeriod = period;
        this.offset = offset;
    }

    setDamage(damage: number): void {
        this.damage = damage;
    }

    getDamage(): number {
        return this.damage;
    }

    setOnAttack(attackCallback: () => void) {
        this.onAttack = attackCallback;
    }

}
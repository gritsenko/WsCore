import { Behavior } from './Behavior';
import { Object3D, Sprite, SpriteMaterial } from 'three';

export enum SineType {
    HORIZONTAL,
    VERTICAL,
    SCALE,
    OPACITY
}

export enum WaveType {
    SINE,
    SAWTOOTH,
    TRIANGLE,
    SQUARE
}

export class Sine extends Behavior {
    amplitude: number;
    period: number;
    phase: number;
    value: number;
    type: SineType;
    wave: WaveType;
    initialX: number = 0;
    initialY: number = 0;
    initialScaleX: number = 1;
    initialScaleY: number = 1;
    initialScaleZ: number = 1;
    initialOpacity: number = 1;

    constructor(period: number, amplitude: number, offset: number, type: SineType, wave: WaveType = WaveType.SINE) {
        super();

        this.type = type;
        this.wave = wave;
        this.amplitude = amplitude;
        this.period = period;
        this.phase = offset;
        this.value = 0;
    }

    onAttach(): void {
        this.resetInitialValues();
    }

    public resetInitialValues(): void {
        this.initialX = this.object3d.position.x;
        this.initialY = this.object3d.position.y;
        this.initialScaleX = this.object3d.scale.x;
        this.initialScaleY = this.object3d.scale.y;
        this.initialScaleZ = this.object3d.scale.z;

        if (this.object3d instanceof Sprite) {
            const material = this.object3d.material as SpriteMaterial;
            this.initialOpacity = material.opacity;
        }
    }

    static parseSineType(sineType: string) {
        return SineType[sineType as keyof typeof SineType];
    }

    static parseWaveType(waveType: string) {
        return WaveType[waveType as keyof typeof WaveType];
    }

    calculateWaveValue(): number {
        const t = (this.phase / this.period) % (2 * Math.PI);
        switch (this.wave) {
            case WaveType.SINE:
                return this.amplitude * Math.sin(t);
            case WaveType.SAWTOOTH:
                return this.amplitude * (2 * (t / (2 * Math.PI)) - 1);
            case WaveType.TRIANGLE:
                return this.amplitude * (2 * Math.abs(2 * (t / (2 * Math.PI)) - 1) - 1);
            case WaveType.SQUARE:
                return this.amplitude * (Math.sign(Math.sin(t)));
            default:
                return 0;
        }
    }

    onTick(dt: any): void {
        if (!this.isEnabled) return;

        this.phase += dt;
        this.value = this.calculateWaveValue();

        switch (this.type) {
            case SineType.HORIZONTAL:
                this.object3d.position.x = this.value + this.initialX;
                break;
            case SineType.VERTICAL:
                this.object3d.position.y = this.value + this.initialY;
                break;
            case SineType.SCALE:
                const newScaleX = this.initialScaleX + this.value;
                const newScaleY = this.initialScaleY + this.value;
                const newScaleZ = this.initialScaleZ + this.value;
                if (this.object3d instanceof Sprite) {
                    this.object3d.scale.set(newScaleX, newScaleY, 1);
                } else {
                    this.object3d.scale.set(newScaleX, newScaleY, newScaleZ);
                }
                break;
            case SineType.OPACITY:
                if (this.object3d instanceof Sprite) {
                    const material = this.object3d.material as SpriteMaterial;
                    const newOpacity = Math.max(0, Math.min(1, this.initialOpacity + this.value));
                    material.opacity = newOpacity;
                }
                break;
        }
    }
}

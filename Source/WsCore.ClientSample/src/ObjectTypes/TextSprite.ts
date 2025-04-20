import * as THREE from 'three';
import { Behavior } from '../Behaviors/Behavior';

export type TextAlignment = 'left' | 'center' | 'right';

interface TextSpriteOptions {
    fontface?: string;
    fontsize?: number;
    borderThickness?: number;
    borderColor?: { r: number; g: number; b: number; a: number };
    backgroundColor?: { r: number; g: number; b: number; a: number };
    textColor?: string;
    align?: TextAlignment;
    lineHeight?: number;
}

export class TextSprite extends THREE.Sprite {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    fontsize: number;
    borderThickness: number;
    spriteMaterial: THREE.SpriteMaterial;
    fadeOut: Behavior;
    moveUp: Behavior;
    align: TextAlignment;
    lineHeight: number;
    fontface: string;
    textColor: string;

    constructor(text: string, options: TextSpriteOptions = {}) {
        super();

        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d')!;

        // Store these for reuse in updateText
        this.fontface = options.fontface ?? "Arial";
        this.fontsize = (options.fontsize ?? 18) * 1.5;
        this.borderThickness = options.borderThickness ?? 4;
        this.textColor = options.textColor ?? "#ffffff";
        this.align = options.align ?? 'center';
        this.lineHeight = options.lineHeight ?? 1.2;

        // Set initial text and create sprite
        this.updateText(text);

        // Adjust sprite center based on alignment
        switch (this.align) {
            case 'left':
                this.center.set(0, 1);
                break;
            case 'right':
                this.center.set(1, 1);
                break;
            case 'center':
            default:
                this.center.set(0.5, 1);
                break;
        }
    }

    updateText(text: string) {
        // Reset font before measuring text
        this.context.font = `Bold ${this.fontsize}px ${this.fontface}`;
        
        // Split text and calculate dimensions
        const lines = text.split('\n');
        const metrics = lines.map(line => this.context.measureText(line));
        const textWidth = Math.max(...metrics.map(m => m.width));
        const textHeight = this.fontsize * lines.length * this.lineHeight;

        // Update canvas size with padding
        const padding = this.borderThickness * 2;
        this.canvas.width = textWidth + padding;
        this.canvas.height = textHeight + padding;

        // Reset context properties after canvas resize
        this.context.font = `Bold ${this.fontsize}px ${this.fontface}`;
        this.context.fillStyle = this.textColor;
        this.context.textBaseline = 'middle';
        this.context.textAlign = this.align;

        // Calculate base Y position for the first line
        const lineHeight = this.fontsize * this.lineHeight;
        const totalHeight = lines.length * lineHeight;
        let startY = (this.canvas.height / 2) - (totalHeight / 2) + (lineHeight / 2);

        // Draw each line
        lines.forEach((line, index) => {
            let x: number;
            switch (this.align) {
                case 'left':
                    x = padding;
                    break;
                case 'right':
                    x = this.canvas.width - padding;
                    break;
                case 'center':
                default:
                    x = this.canvas.width / 2;
                    break;
            }

            const y = startY + (index * lineHeight);
            this.context.fillText(line, x, y);
        });

        // Create or update texture
        const texture = new THREE.Texture(this.canvas);
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Update or create material
        if (!this.spriteMaterial) {
            this.spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
            });
            this.material = this.spriteMaterial;
        } else {
            this.spriteMaterial.map = texture;
        }

        // Set base scale (without DPI consideration)
        const textAspect = this.canvas.width / this.canvas.height;
        this.scale.set(
            this.fontsize * textAspect,
            this.fontsize,
            1
        );
    }
}
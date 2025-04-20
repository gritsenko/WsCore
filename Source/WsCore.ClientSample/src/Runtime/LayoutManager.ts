import * as THREE from 'three';
import AssetLoader from './AssetLoader';
import { TextAlignment, TextSprite } from '../ObjectTypes/TextSprite';
import { Behavior } from '../Behaviors/Behavior';
import { FadeOut } from '../Behaviors/FadeOut';
import { Sine, SineType, WaveType } from '../Behaviors/Sine';

// types.ts
interface UiLayoutAnchor {
    horizontal: 'left' | 'center' | 'right';
    vertical: 'top' | 'center' | 'bottom';
}

interface BehaviorDefinition {
    type: string;
    params: Record<string, any>;
}

export interface UiElementLayout {
    align: string;
    angle: number;
    stretchToScreen?: boolean;
    text?: string;
    fontSize?: number;
    name: string;
    type: string;
    group: string;
    textureName: string;
    anchor: UiLayoutAnchor;
    visible: boolean;
    opacity: number;
    margin?: {
        x: number;
        y: number;
    };
    scale?: number;
    initialPosition?: {
        x: number;
        y: number;
    };
    behaviors?: BehaviorDefinition[];  // Add behaviors property
}

interface UiLayout {
    baseWidth: number;
    baseHeight: number;
    elements: UiElementLayout[];
}

// UiLayoutManager.ts
export class UiLayoutManager {
    private scene: THREE.Scene;
    private layout: UiLayout;
    private elements: Map<string, THREE.Sprite> = new Map();
    private groups: Map<string, THREE.Sprite[]> = new Map();
    private assetLoader: AssetLoader;
    private baseScale: number = 1;

    constructor(scene: THREE.Scene, assetLoader: AssetLoader) {
        this.scene = scene;
        this.assetLoader = assetLoader;
    }

    loadLayout(layoutJson: UiLayout) {
        this.layout = layoutJson;
        this.initializeElements();

        console.log(this);
    }

    private initializeElements() {
        this.layout.elements.forEach(element => {

            const sprite = this.createObjectByElementType(element);
            sprite.visible = element.visible ?? true;
            this.elements.set(element.name, sprite);
            this.scene.add(sprite);

            if (element.group) {
                let group = this.groups.get(element.group);
                if (!group) {
                    group = [];
                    this.groups.set(element.group, group);
                }
                group.push(sprite);
            }

            // Apply initial position if specified
            if (element.initialPosition) {
                sprite.position.set(
                    element.initialPosition.x,
                    element.initialPosition.y,
                    sprite.position.z
                );
            }

            // Initialize behaviors if defined
            if (element.behaviors) {
                this.initializeBehaviors(element.name, element.behaviors, sprite);
            }

        });
    }

    private createObjectByElementType(element: UiElementLayout) {

        const type = element.type;

        switch (type) {
            case 'Sprite':
                return this.createSprite(element);
            case 'Text':
                return this.createTextSprite(element);
            default:
                throw new Error(`Unsupported object type: ${type}`);
        }
    }

    private createSprite(element: UiElementLayout): THREE.Sprite {
        const texture = this.assetLoader.getTextureByName(element.textureName);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.name = element.name;

        if (element.opacity !== undefined)
            material.opacity = element.opacity;

        if (element.angle !== undefined)
            material.rotation = element.angle * Math.PI / 180;

        // Set anchor point based on configuration
        if (element.anchor)
            sprite.center.set(
                element.anchor.horizontal === 'left' ? 0 :
                    element.anchor.horizontal === 'right' ? 1 : 0.5,
                element.anchor.vertical === 'bottom' ? 0 :
                    element.anchor.vertical === 'top' ? 1 : 0.5
            );

        return sprite;
    }

    private createTextSprite(element: UiElementLayout): TextSprite {

        const fontSize = element.fontSize ?? 70;
        const text = element.text ?? "";
        const align = element.align ?? 'center';

        const sprite = new TextSprite(text, {
            fontsize: fontSize,
            align: align as TextAlignment
        });
        sprite.name = element.name;

        if (element.opacity !== undefined)
            sprite.material.opacity = element.opacity;

        if (element.angle !== undefined)
            sprite.material.rotation = element.angle * Math.PI / 180;

        // Set anchor point based on configuration
        if (element.anchor)
            sprite.center.set(
                element.anchor.horizontal === 'left' ? 0 :
                    element.anchor.horizontal === 'right' ? 1 : 0.5,
                element.anchor.vertical === 'bottom' ? 0 :
                    element.anchor.vertical === 'top' ? 1 : 0.5
            );

        return sprite;
    }

    updateLayout() {

        const width = window.innerWidth;
        const height = window.innerHeight;

        // Calculate base scale similar to your current implementation
        const aspect = width / height;
        this.baseScale = aspect < 1 ?
            width / this.layout.baseWidth :
            height / this.layout.baseHeight;
        this.baseScale *= 0.5;

        this.layout.elements.forEach(element => {
            const sprite = this.elements.get(element.name);
            if (!sprite) return;

            // Preserve current position before updating
            const currentPos = sprite.position.clone();

            // Calculate new position based on anchor and margins
            const newPos = this.calculatePosition(element, width, height);

            if (element.stretchToScreen) {
                // Special handling for sprites that should stretch to screen
                this.updateStretchedSprite(sprite, width, height);
            } else {
                // Normal sprite scaling
                const elementScale = element.scale || 1;
                const material = sprite.material as THREE.SpriteMaterial;
                if (material.map) {
                    sprite.scale.set(
                        material.map.image.width * this.baseScale * elementScale,
                        material.map.image.height * this.baseScale * elementScale,
                        1
                    );
                }
            }

            const offsetX = currentPos.x - sprite.position.x;
            const offsetY = currentPos.y - sprite.position.y;
            sprite.position.set(
                newPos.x + offsetX,
                newPos.y + offsetY,
                sprite.position.z
            );

            if (sprite.userData.behaviors) {
                sprite.userData.behaviors.forEach((behavior: Behavior) => {
                    if (behavior instanceof Sine) {
                        behavior.resetInitialValues();
                    }
                });
            }
        });
    }


    private updateStretchedSprite(sprite: THREE.Sprite, screenWidth: number, screenHeight: number) {
        // Calculate scale to cover the entire screen
        const scaleX = screenWidth;
        const scaleY = screenHeight;

        // Apply the scale directly to make the sprite cover the entire screen
        sprite.scale.set(scaleX, scaleY, 1);

        // Center the sprite
        sprite.position.set(0, 0, sprite.position.z);
        sprite.center.set(0.5, 0.5);
    }

    private calculatePosition(element: UiElementLayout, screenWidth: number, screenHeight: number) {
        if (element.stretchToScreen) {
            return { x: 0, y: 0 }; // Centered position for stretched sprites
        }

        const margin = element.margin || { x: 0, y: 0 };
        const halfWidth = screenWidth / 2;
        const halfHeight = screenHeight / 2;

        let x = 0;
        let y = 0;

        if (!element.anchor) {
            element.anchor = {
                horizontal: 'center',
                vertical: 'center'
            }
        }

        // Calculate x position based on anchor
        switch (element.anchor.horizontal) {
            case 'left':
                x = -halfWidth + margin.x * this.baseScale;
                break;
            case 'right':
                x = halfWidth - margin.x * this.baseScale;
                break;
            case 'center':
                x = margin.x * this.baseScale;
                break;
        }

        // Calculate y position based on anchor
        switch (element.anchor.vertical) {
            case 'top':
                y = halfHeight - margin.y * this.baseScale;
                break;
            case 'bottom':
                y = -halfHeight + margin.y * this.baseScale;
                break;
            case 'center':
                y = margin.y * this.baseScale;
                break;
        }

        return { x, y };
    }

    private initializeBehaviors(elementName: string, behaviorDefs: BehaviorDefinition[], object3d: THREE.Object3D) {
        const elementBehaviors: Behavior[] = [];

        behaviorDefs.forEach(behaviorDef => {
            const behavior = this.createBehavior(behaviorDef);
            if (behavior) {
                const isActive = behaviorDef.params?.isEnabled ?? true;
                if (!isActive)
                    behavior.disable();

                behavior.object3d = object3d;
                elementBehaviors.push(behavior);
            }
        });

        if (elementBehaviors.length > 0) {
            elementBehaviors.forEach(behavior => {
                Behavior.AddTo(object3d, behavior);
            });
        }
    }

    private createBehavior(behaviorDef: BehaviorDefinition): Behavior | null {
        switch (behaviorDef.type) {
            case 'FadeOut':
                return new FadeOut(
                    behaviorDef.params.duration,
                    behaviorDef.params.destroyOnFade
                );
            case 'Sine': {
                const type = Sine.parseSineType(behaviorDef.params.type);
                const wave = Sine.parseWaveType(behaviorDef.params.waveType);

                const sine = new Sine(
                    behaviorDef.params.period,
                    behaviorDef.params.amplitude,
                    behaviorDef.params.offset,
                    type,
                    wave ?? WaveType.SINE
                );
                // if (initialPosition) {
                //     sine.initialX = initialPosition.x;
                //     sine.initialY = initialPosition.y;
                // }
                return sine;
            }
            // Add other behavior types here
            default:
                console.warn(`Unknown behavior type: ${behaviorDef.type}`);
                return null;
        }
    }

    invalidate() {
        // Store current positions and scales
        const currentStates = new Map<string, { position: THREE.Vector3, scale: THREE.Vector3 }>();

        this.elements.forEach((sprite, name) => {
            currentStates.set(name, {
                position: sprite.position.clone(),
                scale: sprite.scale.clone()
            });
        });

        // Recalculate layout
        this.updateLayout();

        // Apply stored positions and adjust scales if needed
        this.elements.forEach((sprite, name) => {
            const previousState = currentStates.get(name);
            if (previousState && !this.layout.elements.find(e => e.name === name)?.stretchToScreen) {
                if (sprite instanceof TextSprite) {
                    // For text sprites, we only restore position as scale is handled internally
                    sprite.position.copy(previousState.position);
                } else {
                    // For regular sprites, restore both position and scale
                    sprite.position.copy(previousState.position);
                    sprite.scale.copy(previousState.scale);
                }
            }
        });
    }

    getElement(name: string): THREE.Sprite | undefined {
        return this.elements.get(name);
    }
    getUiElement(name: string): UiElementLayout | undefined {
        return this.layout.elements.find(e => e.name === name);
    }

    getScale = () => this.baseScale;

    hideElement(elementName: string) {
        const el = this.getElement(elementName);
        if (el)
            el.visible = false;
    }
    hideGroup(groupName: string) {
        this.groups.get(groupName)?.forEach(element => element.visible = false);
    }

    showElement(elementName: string) {
        const el = this.getElement(elementName);
        if (el)
            el.visible = true;
    }
    showGroup(groupName: string) {
        this.groups.get(groupName)?.forEach(element => element.visible = true);
    }

}
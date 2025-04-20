import * as THREE from 'three';
import { UiElementLayout, UiLayoutManager } from '../Runtime/LayoutManager';
import AssetLoader from '../Runtime/AssetLoader';
import { IGameScene } from './GameScene';
import { Behavior } from '../Behaviors/Behavior';

export default class UiLayer extends THREE.Scene implements IGameScene {
    private layoutManager: UiLayoutManager;
    assetLoader: AssetLoader;

    constructor(assetLoader: AssetLoader) {
        super();
        this.assetLoader = assetLoader;
        this.layoutManager = new UiLayoutManager(this, assetLoader);
    }

    onTick(dt) {
        this.children.forEach(x => {
            Behavior.ObjectBehaviorsOnTick(x, dt);
        });
    }

    init() {
        // Load layout from JSON
        const layoutJson = this.assetLoader.uiLayerJson;
        this.layoutManager.loadLayout(layoutJson);
        this.updateLayout();

        this.initializeBehaviors();
    }

    initializeBehaviors() {
        this.children.forEach(x => {
            Behavior.OnAttached(x);
        });
    }

    updateLayout() {
        this.layoutManager.updateLayout();
    }

    getUiScale() {
        return this.layoutManager.getScale();
    }

    hideItem(elementName: string) {
        this.layoutManager.hideElement(elementName);
    }

    hideGroup(groupName: string) {
        this.layoutManager.hideGroup(groupName);
    }

    showGroup(groupName: string) {
        this.layoutManager.showGroup(groupName);
    }
    showItem(elementName: string) {
        this.layoutManager.showElement(elementName);
    }

    ivalidateLayout() {
        this.layoutManager.invalidate();
    }

    getUiElementByName(name: string): UiElementLayout | undefined {
        return this.layoutManager.getUiElement(name);
    }
}
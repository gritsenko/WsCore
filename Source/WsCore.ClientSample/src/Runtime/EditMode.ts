import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as dat from 'dat.gui';
import App from '../app';
import AssetLoader from './AssetLoader';
import { GLTF } from 'three/examples/jsm/Addons.js';
import GameScene from '../ObjectTypes/GameScene';
import GameObject from '../ObjectTypes/GameObject';

export class EditMode {
    private orbitControls: OrbitControls;
    private transformControls: TransformControls;
    private raycaster: THREE.Raycaster;
    private selectedObject: THREE.Object3D | null = null;
    private editModeOverlay: HTMLDivElement;
    private selectionBox: THREE.Box3Helper | null = null;
    private currentGizmo: THREE.Object3D | null = null;
    private glbFileSidebar: HTMLDivElement;
    private fileDirectory: any;
    private gui: dat.GUI;
    private hierarchyPanel: HTMLDivElement;
    private assetLoader: AssetLoader;

    private scene: GameScene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.Renderer;

    get isActive() { return this.orbitControls.enabled }

    constructor(scene: GameScene, renderer: THREE.Renderer, assetLoader: AssetLoader) {
        this.scene = scene;
        this.raycaster = new THREE.Raycaster();

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.y = 10;
        camera.position.x = 10;
        this.camera = camera;

        this.assetLoader = assetLoader;
        this.renderer = renderer;

        // Create Orbit Controls
        this.orbitControls = new OrbitControls(camera, renderer.domElement);
        this.orbitControls.enabled = false;

        // Create Transform Controls
        this.transformControls = new TransformControls(camera, renderer.domElement);
        this.transformControls.showY = true;
        this.transformControls.showX = true;
        this.transformControls.showZ = true;

        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.orbitControls.enabled = !event.value;
            //this.app.animate();
        });

        this.createEditModeOverlay();
        this.createGLBFileSidebar();

        this.createHierarchyPanel();
        this.updateHierarchyPanel();

        this.setupEventListeners();
        this.initGUI();
    }

    private createHierarchyPanel() {
        this.hierarchyPanel = document.createElement('div');
        this.hierarchyPanel.style.display = 'none';
        this.hierarchyPanel.style.position = 'fixed';
        this.hierarchyPanel.style.bottom = '10px';
        this.hierarchyPanel.style.right = '10px';
        this.hierarchyPanel.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.hierarchyPanel.style.color = 'white';
        this.hierarchyPanel.style.padding = '10px';
        this.hierarchyPanel.style.borderRadius = '5px';
        this.hierarchyPanel.style.zIndex = '1000';
        this.hierarchyPanel.style.width = '250px';
        this.hierarchyPanel.style.maxHeight = '80vh';
        this.hierarchyPanel.style.overflowY = 'auto';

        const header = document.createElement('div');
        header.textContent = 'Hierarchy';
        header.style.borderBottom = '1px solid white';
        header.style.paddingBottom = '5px';
        header.style.marginBottom = '10px';
        header.style.fontWeight = 'bold';

        this.hierarchyPanel.appendChild(header);
        document.body.appendChild(this.hierarchyPanel);
    }

    private updateHierarchyPanel() {
        // Clear existing items except header
        const header = this.hierarchyPanel.firstChild;
        this.hierarchyPanel.innerHTML = '';
        this.hierarchyPanel.appendChild(header!);

        const createObjectEntry = (object: THREE.Object3D, depth: number = 0) => {
            const entry = document.createElement('div');
            entry.style.padding = '3px';
            entry.style.paddingLeft = `${depth * 20 + 10}px`;
            entry.style.cursor = 'pointer';
            entry.style.display = 'flex';
            entry.style.alignItems = 'center';

            // Visibility toggle
            const visibilityToggle = document.createElement('span');
            visibilityToggle.textContent = object.visible ? '👁️' : '👁️‍🗨️';
            visibilityToggle.style.marginRight = '5px';
            visibilityToggle.style.cursor = 'pointer';
            visibilityToggle.onclick = (e) => {
                e.stopPropagation();
                object.visible = !object.visible;
                this.updateHierarchyPanel();
            };

            // Object name/type
            const nameSpan = document.createElement('span');
            nameSpan.textContent = object.name || object.type;

            entry.appendChild(visibilityToggle);
            entry.appendChild(nameSpan);

            // Highlight selected object
            if (this.selectedObject === object) {
                entry.style.backgroundColor = 'rgba(255,255,255,0.2)';
            }

            entry.onclick = () => {
                this.deselectObject();
                this.selectObjectFromHierarchy(object);
            };

            this.hierarchyPanel.appendChild(entry);

            // Recursively create entries for children
            object.children.forEach(child => {
                if (depth >= 0) return;
                createObjectEntry(child, depth + 1);
            });
        };

        // Create entries for all objects in the scene
        this.scene.children.forEach(object => {
            if (object.type !== 'Scene') {
                createObjectEntry(object);
            }
        });
    }

    private selectObjectFromHierarchy(object: THREE.Object3D) {
        this.selectedObject = object;
        this.transformControls.attach(object);
        this.createSelectionHelper(object);
        this.createObjectGUI(object);
        this.updateHierarchyPanel(); // Refresh to show selection
    }

    private initGUI() {
        this.gui = new dat.GUI();
        this.gui.domElement.style.position = 'fixed';
        this.gui.domElement.style.top = '10px';
        this.gui.domElement.style.left = '220px';
        this.gui.domElement.style.zIndex = '1000';
        this.gui.hide(); // Hide by default, shown only when an object is selected
    }

    private createEditModeOverlay() {
        this.editModeOverlay = document.createElement('div');
        this.editModeOverlay.style.display = 'none';
        this.editModeOverlay.style.position = 'fixed';
        this.editModeOverlay.style.top = '10px';
        this.editModeOverlay.style.left = '10px';
        this.editModeOverlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.editModeOverlay.style.color = 'white';
        this.editModeOverlay.style.padding = '10px';
        this.editModeOverlay.style.borderRadius = '5px';
        this.editModeOverlay.style.zIndex = '1000';

        const modeButtons = [
            { mode: 'translate', icon: '↔' },
            { mode: 'rotate', icon: '⟳' },
            { mode: 'scale', icon: '⤢' }
        ];

        modeButtons.forEach(({ mode, icon }) => {
            const button = document.createElement('button');
            button.textContent = icon;
            button.style.margin = '0 5px';
            button.onclick = () => this.setTransformMode(mode as any);
            this.editModeOverlay.appendChild(button);
        });

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.style.margin = '0 5px';
        saveButton.onclick = () => this.saveScene();
        this.editModeOverlay.appendChild(saveButton);

        const loadButton = document.createElement('button');
        loadButton.textContent = 'Load';
        loadButton.style.margin = '0 5px';
        loadButton.onclick = () => this.loadScene();
        this.editModeOverlay.appendChild(loadButton);

        document.body.appendChild(this.editModeOverlay);
    }

    private createGLBFileSidebar() {
        this.glbFileSidebar = document.createElement('div');
        this.glbFileSidebar.style.display = 'none';
        this.glbFileSidebar.style.position = 'fixed';
        this.glbFileSidebar.style.top = '80px';
        this.glbFileSidebar.style.left = '10px';
        this.glbFileSidebar.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.glbFileSidebar.style.color = 'white';
        this.glbFileSidebar.style.padding = '10px';
        this.glbFileSidebar.style.borderRadius = '5px';
        this.glbFileSidebar.style.zIndex = '1000';
        this.glbFileSidebar.style.width = '200px';
        this.glbFileSidebar.style.maxHeight = '400px';
        this.glbFileSidebar.style.overflowY = 'auto';

        document.body.appendChild(this.glbFileSidebar);

        this.listGLBFiles();
    }

    private async listGLBFiles() {
        this.glbFileSidebar.innerHTML = ''; // Clear existing entries

        this.assetLoader.gltfs.forEach((item) => {
            const fileButton = document.createElement('button');
            fileButton.textContent = item.key;
            fileButton.style.display = 'block';
            fileButton.style.margin = '5px 0';
            fileButton.onclick = () => this.addGlbToScene(item);
            this.glbFileSidebar.appendChild(fileButton);
        });
    }

    private async addGlbToScene(gltfItem: { key: string, gltf: GLTF }) {
        try {

            const transform = {
                position: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Euler(0, 0, 0),
                scale: new THREE.Vector3(1, 1, 1),
                quaternion: new THREE.Quaternion()
            };

            const gameObject = this.assetLoader.loadGltfToGameObject(
                gltfItem.key.replace("_glb", ""),
                gltfItem.key,
                transform
            );
            this.scene.addGameObject(gameObject);
            this.updateHierarchyPanel();
        } catch (error) {
            console.error('Error loading gltf:', error);
        }
    }

    private setupEventListeners() {
        // Existing event listener setup
    }

    toggleEditMode() {
        const isEditMode = this.orbitControls.enabled;
        this.orbitControls.enabled = !isEditMode;
        this.editModeOverlay.style.display = isEditMode ? 'none' : 'block';
        this.hierarchyPanel.style.display = isEditMode ? 'none' : 'block';
        this.glbFileSidebar.style.display = isEditMode ? 'none' : 'block';

        if (!isEditMode) {
            this.renderer.domElement.addEventListener('click', this.selectObject);
        } else {
            this.renderer.domElement.removeEventListener('click', this.selectObject);
            this.deselectObject();
        }
    }

    private selectObject = (event: MouseEvent) => {
        if (this.transformControls.dragging) return;

        const pointer = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );

        this.raycaster.setFromCamera(pointer, this.camera);
        const intersectableObjects = this.getFlattenedSceneObjects();
        const intersects = this.raycaster.intersectObjects(intersectableObjects, true);

        if (intersects.length > 0) {
            const selectedObject = this.findRootObject(intersects[0].object);
            if (selectedObject === this.currentGizmo) return;

            this.deselectObject();
            this.selectObjectFromHierarchy(selectedObject);
        }
    }

    private createObjectGUI(object: THREE.Object3D) {
        this.gui.show();
        this.gui.destroy();
        this.gui = new dat.GUI();

        const createNumericInput = (
            folder: dat.GUI,
            object: any,
            property: string,
            min?: number,
            max?: number
        ) => {
            const controller = folder.add(object, property, min, max).step(0.1);

            // Enable keyboard input
            const input = controller.domElement.querySelector('input');
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const value = parseFloat(input.value);
                        if (!isNaN(value)) {
                            object[property] = value;
                            controller.updateDisplay();
                        }
                    }
                });
            }
            return controller;
        };

        const positionFolder = this.gui.addFolder('Position');
        createNumericInput(positionFolder, object.position, 'x');
        createNumericInput(positionFolder, object.position, 'y');
        createNumericInput(positionFolder, object.position, 'z');
        positionFolder.open();

        const rotationFolder = this.gui.addFolder('Rotation');
        createNumericInput(rotationFolder, object.rotation, 'x', -Math.PI, Math.PI);
        createNumericInput(rotationFolder, object.rotation, 'y', -Math.PI, Math.PI);
        createNumericInput(rotationFolder, object.rotation, 'z', -Math.PI, Math.PI);
        rotationFolder.open();

        // Add animation controls if object is GameObject
        if (object instanceof GameObject && object.animations.length > 0) {
            const animationFolder = this.gui.addFolder('Animation');

            // Create animation names array for dropdown
            const animationNames = object.animations.map(clip => clip.name);

            // Create animation state object for dat.GUI
            const animationState = {
                currentAnimation: object.currentAnimationName || animationNames[0],
                play: () => {
                    if (animationState.currentAnimation) {
                        object.playAnimation(animationState.currentAnimation);
                    }
                },
                stop: () => {
                    object.pauseAnimation();
                }
            };

            // Add animation dropdown
            animationFolder.add(animationState, 'currentAnimation', animationNames)
                .name('Animation')
                .onChange((value: string) => {
                    object.playAnimation(value);
                });

            // Add play/stop buttons
            animationFolder.add(animationState, 'play').name('Play');
            animationFolder.add(animationState, 'stop').name('Stop');

            animationFolder.open();
        }

        const descendantMesh = this.findFirstDescendantMesh(object);
        if (descendantMesh && descendantMesh.material instanceof THREE.Material) {
            const material = descendantMesh.material;
            const materialFolder = this.gui.addFolder('Material');
            createNumericInput(materialFolder, material, 'opacity', 0, 1);
            materialFolder.open();
        }

        // Add name editing
        const nameFolder = this.gui.addFolder('Object');
        const nameController = nameFolder.add(object, 'name');
        nameFolder.open();

        // Update hierarchy panel when any value changes
        this.gui.__controllers.forEach(controller => {
            controller.onChange(() => {
                this.updateHierarchyPanel();
            });
        });
    }

    private findFirstDescendantMesh(object: THREE.Object3D): THREE.Mesh | null {
        if (object instanceof THREE.Mesh) {
            return object;
        }
        for (const child of object.children) {
            const mesh = this.findFirstDescendantMesh(child);
            if (mesh) return mesh;
        }
        return null;
    }

    private findRootObject(object: THREE.Object3D): THREE.Object3D {
        // Traverse up the parent hierarchy until we find the top-level object
        while (object.parent &&
            object.parent.type !== 'Scene' &&
            object.parent !== this.scene) {
            object = object.parent;
        }
        return object;
    }

    private createSelectionHelper(object: THREE.Object3D) {
        // Remove any existing selection box
        if (this.selectionBox) {
            //this.app.mainScene.remove(this.selectionBox);
        }

        // Create a bounding box for the selected object
        const box = new THREE.Box3().setFromObject(object);
        this.selectionBox = new THREE.Box3Helper(box, 0x00ff00);
        //this.app.mainScene.add(this.selectionBox);

        if (this.currentGizmo) {
            this.scene.remove(this.currentGizmo);
        };
        this.currentGizmo = this.transformControls.getHelper();
        this.scene.add(this.currentGizmo);
    }

    private deselectObject() {
        if (this.selectionBox) {
            this.scene.remove(this.selectionBox);
            this.selectionBox = null;
        }

        this.transformControls.detach();
        this.selectedObject = null;
        this.gui.hide();
        this.updateHierarchyPanel(); // Refresh to clear selection
    }


    private getFlattenedSceneObjects(): THREE.Object3D[] {
        const objects: THREE.Object3D[] = [];

        const traverseScene = (obj: THREE.Object3D) => {
            // Skip certain types of objects or invisible objects
            if (obj.type !== 'Scene' && obj.visible) {
                objects.push(obj);
            }

            // Recursively traverse child objects
            obj.children.forEach(traverseScene);
        };

        this.scene.traverse(traverseScene);
        return objects;
    }

    private setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
        this.transformControls.setMode(mode);
    }

    // Save and load methods remain the same as in the previous implementation
    private saveScene() {
        const sceneData = this.scene.getGameObjects()
            .filter(obj => obj.type !== 'Scene')
            .map(obj => ({
                name: obj.name,
                modelName: obj.modelName,
                type: obj.type,
                position: obj.position,
                rotation: obj.rotation.toArray(),
                scale: obj.scale
            }));

        const json = JSON.stringify(sceneData);
        localStorage.setItem('savedScene', json);
        console.log(JSON.stringify(sceneData));

        this.saveJsonFileAs(json);
    }

    async saveJsonFileAs(json: string) {
        const blob = new Blob([json], { type: 'application/json' });
        const fileHandle = await (window as any).showSaveFilePicker({
            types: [
                {
                    description: 'JSON file',
                    accept: { 'application/json': ['.json'] },
                },
            ],
            defaultName: 'scene.json',
        });

        if (fileHandle) {
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
        }
    }

    private loadScene() {
        const savedSceneData = localStorage.getItem('savedScene');
        if (savedSceneData) {
            const sceneData = JSON.parse(savedSceneData);

            // Remove existing objects (except lights and camera)
            const objectsToRemove = this.scene.children.filter(
                obj => obj.type !== 'Scene' &&
                    obj.type !== 'PerspectiveCamera' &&
                    obj.type !== 'PointLight'
            );
            objectsToRemove.forEach(obj => this.scene.remove(obj));

            // Recreate objects (you'll need to implement object recreation logic)
            sceneData.forEach(objData => {
                // This is a placeholder - you'll need to implement actual object recreation
                // based on your specific scene setup
                const newObject = new THREE.Object3D();
                newObject.name = objData.name;
                newObject.position.fromArray(objData.position);
                newObject.rotation.fromArray(objData.rotation);
                newObject.scale.fromArray(objData.scale);
                this.scene.add(newObject);
            });
        }
    }

    private static editorInstance: EditMode | null = null;
    static enableEditor(app: App) {
        EditMode.editorInstance ??= new EditMode(app.mainScene, app.renderer, app.assetLoader);
        const inst = EditMode.editorInstance;
        document.addEventListener('keydown', (event) => {
            if (event.key === '`') {
                inst.toggleEditMode();

                if (inst.isActive) {
                    app.overrideCamera(inst.camera);
                    //this.gameScript.cameraController.disable();
                } else {
                    app.resetCamera();
                    //this.gameScript.cameraController.enable();
                }
            }
        });
    }
}
import * as THREE from 'three';
import { decode } from 'base64-arraybuffer'
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import assets from '../assets.js'
import GameObject from '../ObjectTypes/GameObject.js';
import { SkeletonUtils } from 'three/examples/jsm/Addons.js';
import { Transform } from './index.js';
import { Howl } from 'howler';
import * as JSZip from 'jszip';

type ResourceEntry = { key: string, url: string };

export default class AssetLoader {

    static texUrl = assets.buttonImg;
    textureLoader: THREE.TextureLoader;
    gltfLoader: GLTFLoader;
    tutorial_screen: THREE.DataTexture;
    levelJson: any;
    uiLayerJson: any;
    textures: { key: string, texture: THREE.Texture }[];
    gltfs: { key: string, gltf: GLTF }[];
    sounds: { key: string; sound: Howl; }[];

    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();
    }

    async loadAssets() {

        const textureEntries = Object.keys(assets.textures).map((textureName) => ({
            key: textureName, url: assets.textures[textureName] as string,
        }));

        this.textures = await this.loadResoucesAsync(textureEntries, t => this.loadTextureAsync(t));

        const modelEntries = Object.keys(assets.models).map((modelName) => ({
            key: modelName, url: assets.models[modelName] as string,
        }));
        this.gltfs = await this.loadResoucesAsync(modelEntries, t => this.loadGltfAsync(t));

        this.tutorial_screen = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
        this.tutorial_screen.needsUpdate = true;

        this.levelJson = await fetch(assets.scenes.levelData).then((response) => response.json());
        this.uiLayerJson = await fetch(assets.scenes.uiLayerData).then((response) => response.json());
        //console.log(this.levelJson);

        const soundEntries = Object.keys(assets.sounds).map((soundName) => ({
            key: soundName, url: assets.sounds[soundName] as string,
        }));
        this.sounds = await this.loadResoucesAsync(soundEntries, t => this.loadSoundAsync(t));
    }

    async loadSoundAsync(entry: ResourceEntry): Promise<{ key: string; sound: Howl; }> {
        const sound = new Howl({ src: [entry.url] });
        sound.load();
        return { key: entry.key, sound };
    }
    async loadResoucesAsync<T>(entries: ResourceEntry[], loaderFunc?: (entry: ResourceEntry) => Promise<T>) {
        const loadingPromises = entries.map((entry) => {
            return loaderFunc!(entry);
        });

        const resultPromises = await Promise.allSettled(loadingPromises);
        const result = resultPromises
            .filter(x => x.status === 'fulfilled')
            .map((x) => x.value);

        return result;
    }

    getGltfByName(name: string) {
        const gltf = this.gltfs.find(x => x.key === name)?.gltf as GLTF;
        return gltf;
    }

    getTextureByName(name: string): THREE.Texture {
        const texture = this.textures.find(x => x.key === name)?.texture as THREE.Texture;
        return texture;
    }

    playSoundByName(name: string) {
        const sound = this.getSoundByName(name);
        sound.play();
    }

    muteSounds() {
        Howler.mute(true);
    }

    getSoundByName(name: string): Howl {
        const sound = this.sounds.find(x => x.key === name)?.sound as Howl;
        return sound;
    }

    async loadTextureAsync(entry: ResourceEntry) {
        const texture = await this.textureLoader.loadAsync(entry.url);
        texture.colorSpace = THREE.SRGBColorSpace;
        return { key: entry.key, texture };
    }

    async loadGltfAsync(entry: ResourceEntry): Promise<{ key: string, gltf: GLTF }> {    
        // Original file processing (in debug mode)
        if (entry.url.startsWith('/')) {
            return this.loadGltfFromRegualarUrl(entry);
        }
        return this.loadBase64Gltf(entry);
    }

    async loadGltfFromRegualarUrl(entry: ResourceEntry) {
        const isZipped = entry.url.includes('.glb.zip');
        // Process ZIP archive
        if (isZipped) {
            const response = await fetch(entry.url);
            const zipData = await response.arrayBuffer();
            return this.extractAndParseZip(new Uint8Array(zipData), entry);
        }

        const gltf =  await this.gltfLoader.loadAsync(entry.url);
        return { key: entry.key, gltf };
    }
        
    private async extractAndParseZip(zipData: Uint8Array, entry: ResourceEntry): Promise<{ key: string, gltf: GLTF }> {
        const zip = await JSZip.loadAsync(zipData);
        
        // Find first .glb file in archive
        const glbFile = Object.values(zip.files).find(
            file => file.name.toLowerCase().endsWith('.glb')
        );
    
        if (!glbFile) {
            throw new Error('No GLB file found in ZIP archive');
        }
    
        // Extract GLB file as binary data
        const glbContent = await glbFile.async('arraybuffer');
        
        return new Promise((resolve, reject) => {
            this.gltfLoader.parse(
                glbContent,
                "assets/models",
                gltf => resolve({ key: entry.key, gltf }),
                error => {
                    console.error('Error loading gltf:', error);
                    reject(error);
                }
            );
        });
    }

    private async loadBase64Gltf(entry: ResourceEntry) : Promise<{ key: string, gltf: GLTF }> {

        if(entry.url.startsWith('data:application/zip;base64,')) {
            return this.loadZippedGltf(entry);
        }

        const startIndex = "data:model/gltf-binary;base64,".length;
        const modelStr = entry.url.substring(startIndex);
        const mm = decode(modelStr);
        
        return new Promise((resolve, reject) => {
            this.gltfLoader.parse(
                mm,
                "assets/models",
                gltf => resolve({ key: entry.key, gltf }),
                error => {
                    console.error('Error loading gltf:', error);
                    reject(error);
                }
            );
        });
    }

    private async loadZippedGltf(entry: ResourceEntry): Promise<{ key: string, gltf: GLTF }> {
        // For base64 encoded ZIP (published mode)
        const startIndex = entry.url.indexOf('base64,') + 7;
        const zipBase64 = entry.url.substring(startIndex);
        const zipData = Uint8Array.from(atob(zipBase64), c => c.charCodeAt(0));
        return this.extractAndParseZip(zipData, entry);
    }

    loadGltfToGameObject(name: string, modelName: string, transform: Transform): GameObject {
        const gltf = this.getGltfByName(modelName);
        const instance = SkeletonUtils.clone(gltf.scene);

        const animations = gltf.animations as THREE.AnimationClip[];
        const gameObject = new GameObject(instance, transform, animations);
        gameObject.name = name;
        gameObject.modelName = modelName;
        return gameObject;
    }

}
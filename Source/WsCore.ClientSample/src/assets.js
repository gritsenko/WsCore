import logo_png from './assets/textures/logo.png?url';
import black_png from './assets/textures/black.png?url';

import robot_glb from "./assets/models/Robot.glb.zip?url";

import levelData_json from "./assets/scenes/level.json?url";
import ui_json from "./assets/scenes/ui.json?url";

export default {
    textures: {
        logo_png,
        black_png,
    },
    models: {
        robot_glb,
    },
    scenes: {
        levelData: levelData_json,
        uiLayerData: ui_json,
    },
    sounds: {
    }
};
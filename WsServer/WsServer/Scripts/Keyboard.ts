import KeyDef from "./KeyDef.js";

export default class Keyboard {
    static KEY_LEFT = 65; //A
    static KEY_UP = 87; //W
    static KEY_RIGHT = 68; //D
    static KEY_DOWN = 83; //S

    static KEY_E = 69;

    static KEY_LEFT_MASK_OFFSET = 2;
    static KEY_UP_MASK_OFFSET = 0;
    static KEY_RIGHT_MASK_OFFSET = 3;
    static KEY_DOWN_MASK_OFFSET = 1;

    //KEY_LEFT = 37;
    //KEY_UP = 38;
    //KEY_RIGHT = 39;
    //KEY_DOWN = 40;

    static addHnadler(keyCode) {
        var key = new KeyDef();
        key.code = keyCode;
        key.isDown = false;
        key.isUp = true;
        key.press = undefined;
        key.release = undefined;
        //The `downHandler`
        key.downHandler = event => {
            if (event.keyCode === key.code) {
                if (key.isUp && key.press) key.press();
                key.isDown = true;
                key.isUp = false;
                event.preventDefault();
            }
        };

        //The `upHandler`
        key.upHandler = event => {
            if (event.keyCode === key.code) {
                if (key.isDown && key.release) key.release();
                key.isDown = false;
                key.isUp = true;
                event.preventDefault();
            }
        };

        //Attach event listeners
        window.addEventListener(
            "keydown", key.downHandler.bind(key), false
        );
        window.addEventListener(
            "keyup", key.upHandler.bind(key), false
        );
        return key;
    }
}
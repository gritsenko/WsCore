import KeyDef from "./KeyDef.js";
var Keyboard = /** @class */ (function () {
    function Keyboard() {
    }
    //KEY_LEFT = 37;
    //KEY_UP = 38;
    //KEY_RIGHT = 39;
    //KEY_DOWN = 40;
    Keyboard.addHnadler = function (keyCode) {
        var key = new KeyDef();
        key.code = keyCode;
        key.isDown = false;
        key.isUp = true;
        key.press = undefined;
        key.release = undefined;
        //The `downHandler`
        key.downHandler = function (event) {
            if (event.keyCode === key.code) {
                if (key.isUp && key.press)
                    key.press();
                key.isDown = true;
                key.isUp = false;
                event.preventDefault();
            }
        };
        //The `upHandler`
        key.upHandler = function (event) {
            if (event.keyCode === key.code) {
                if (key.isDown && key.release)
                    key.release();
                key.isDown = false;
                key.isUp = true;
                event.preventDefault();
            }
        };
        //Attach event listeners
        window.addEventListener("keydown", key.downHandler.bind(key), false);
        window.addEventListener("keyup", key.upHandler.bind(key), false);
        return key;
    };
    Keyboard.KEY_LEFT = 65; //A
    Keyboard.KEY_UP = 87; //W
    Keyboard.KEY_RIGHT = 68; //D
    Keyboard.KEY_DOWN = 83; //S
    Keyboard.KEY_E = 69;
    Keyboard.KEY_LEFT_MASK_OFFSET = 2;
    Keyboard.KEY_UP_MASK_OFFSET = 0;
    Keyboard.KEY_RIGHT_MASK_OFFSET = 3;
    Keyboard.KEY_DOWN_MASK_OFFSET = 1;
    return Keyboard;
}());
export default Keyboard;
//# sourceMappingURL=Keyboard.js.map
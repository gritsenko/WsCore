const KEY_LEFT = 65; //A
const KEY_UP = 87; //W
const KEY_RIGHT = 68; //D
const KEY_DOWN = 83; //S

const KEY_LEFT_MASK_OFFSET = 2;
const KEY_UP_MASK_OFFSET = 0;
const KEY_RIGHT_MASK_OFFSET = 3;
const KEY_DOWN_MASK_OFFSET = 1;

//const KEY_LEFT = 37;
//const KEY_UP = 38;
//const KEY_RIGHT = 39;
//const KEY_DOWN = 40;

function lerp(v0 :number, v1 : number, t : number) {
    return v0 * (1 - t) + v1 * t;
}

function isBitSet(target: number, i: number) {
    return target & (1 << i);
}

function setBit(target : number, i : number) {
    const mask = 1 << i;
    target |= mask;
    return target;
}

function clearBit(target : number, i : number) {
    const mask = 1 << i;
    target &= ~mask;
    return target;
}

class KeyDef {
    code : number;
    isDown: boolean;
    isUp: boolean;
    press: ()=>void;
    release: ()=>void;
    downHandler: (event: any) => void;
    upHandler: (event: any) => void;
}

function keyboard(keyCode : number) {
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

var delay = (() => {
    var timer = 0;
    return (callback, ms) => {
        clearTimeout(timer);
        timer = setTimeout(callback, ms);
    };
})();

function debounce(func, wait, immediate) {
    var timeout;
    return function () {
        var context = this, args = arguments;
        var later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};
var app: App;

function runGame() {
    var form = document.getElementById("name-form");
    var textbox = document.getElementById("name-text-input") as HTMLInputElement;
    form.style.display = "none";
    app = new App();
    var userName = textbox.value;
    app.playerName = userName;
}

document.addEventListener("DOMContentLoaded", () => runGame());

function onStartGameClicked() {
    runGame();
}

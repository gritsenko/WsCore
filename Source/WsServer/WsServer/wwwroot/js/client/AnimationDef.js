// class PlayerState {
//     Idle = 0;
//     Run = 1;
//     Attack = 2;
//     Die = 3;
// }
export class AnimationDef {
    key = "";
    framesCount = 0;

    /**
     *
     * @param {string} key
     * @param {number} count
     */
    constructor(key, count) {
        this.key = key;
        this.framesCount = count;
    }
}

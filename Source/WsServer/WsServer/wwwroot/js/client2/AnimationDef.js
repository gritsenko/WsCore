var AnimationDef = /** @class */ (function () {
    function AnimationDef(key, count, frameWidth, frameHeight, rows, cols) {
        if (frameWidth === void 0) { frameWidth = 100; }
        if (frameHeight === void 0) { frameHeight = 100; }
        if (rows === void 0) { rows = 1; }
        if (cols === void 0) { cols = count; }
        this.key = key;
        this.framesCount = count;
        this.frameWidth = frameWidth;
        this.frameHeight = frameHeight;
        this.rows = rows;
        this.cols = cols;
    }
    return AnimationDef;
}());
export default AnimationDef;
//# sourceMappingURL=AnimationDef.js.map
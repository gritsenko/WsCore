import WorldMap from "./World.js";
var MapObject = /** @class */ (function () {
    function MapObject() {
        this.type = 0;
        this.x = 0;
        this.y = 0;
    }
    MapObject.preload = function (loader) {
        loader.load.path = "/assets/map/objects/trees/";
        loader.load.image("tree1", "tree_1.png");
        loader.load.image("tree2", "tree_2.png");
        loader.load.image("tree3", "tree_3.png");
        loader.load.image("tree4", "tree_4.png");
    };
    MapObject.prototype.create = function (currentScene, objData) {
        this.x = objData.X;
        this.y = objData.Y;
        this.type = objData.ObjectType;
        var x = this.x * WorldMap.cellSize + WorldMap.cellSize / 2;
        var y = this.y * WorldMap.cellSize;
        var sprite = currentScene.add.sprite(x, y, "tree" + Math.min(this.type + 1, 4));
        sprite.depth = y + sprite.height / 2;
        this.sprite = sprite;
    };
    MapObject.prototype.destroy = function () {
        this.sprite.destroy(true);
    };
    return MapObject;
}());
export default MapObject;
//# sourceMappingURL=MapObject.js.map
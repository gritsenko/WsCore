import MapObject from "./MapObject.js";
var WorldMap = /** @class */ (function () {
    function WorldMap() {
        this.objects = [];
    }
    WorldMap.preload = function (loader) {
        loader.load.image("ground", "/assets/map/ground/Ground.png");
    };
    WorldMap.prototype.create = function (p) {
        this.currentScene = p;
        this.map = p.make.tilemap({ width: 200, height: 200, tileWidth: WorldMap.cellSize, tileHeight: WorldMap.cellSize });
        var tiles = this.map.addTilesetImage("ground", null, WorldMap.cellSize, WorldMap.cellSize);
        // Create a layer filled with random tiles
        var layer = this.map.createBlankDynamicLayer("layer1", tiles);
        layer.randomize(0, 0, this.map.width, this.map.height, [0, 1, 2, 3]);
        var mapCursor = p.add.graphics();
        this.mapCursor = mapCursor;
        var color = 0xffff00;
        var alpha = 1;
        this.mapCursor.fillStyle(color, alpha);
        this.mapCursor.fillRect(0, 0, WorldMap.cellSize, WorldMap.cellSize);
    };
    WorldMap.prototype.updateMapObjects = function (objs) {
        for (var _i = 0, _a = this.objects; _i < _a.length; _i++) {
            var obj = _a[_i];
            obj.destroy();
        }
        this.objects = [];
        var o = objs;
        for (var i = 0; i < o.length; i++) {
            var mp = new MapObject();
            mp.create(this.currentScene, o[i]);
            this.objects.push(mp);
        }
    };
    WorldMap.prototype.posToCell = function (x) {
        return Math.floor(x / WorldMap.cellSize) * WorldMap.cellSize;
    };
    WorldMap.prototype.phaserUpdate = function (phaser) {
        var camX = 0;
        var camY = 0;
        if (phaser.input.activePointer.camera != null) {
            camX = phaser.input.activePointer.camera.scrollX;
            camY = phaser.input.activePointer.camera.scrollY;
        }
        this.mapCursor.x = this.posToCell(phaser.input.activePointer.x + camX);
        this.mapCursor.y = this.posToCell(phaser.input.activePointer.y + camY);
    };
    WorldMap.cellSize = 50;
    return WorldMap;
}());
export default WorldMap;
//# sourceMappingURL=World.js.map
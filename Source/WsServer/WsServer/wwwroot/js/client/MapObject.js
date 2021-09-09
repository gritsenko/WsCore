export default class MapObject {
    constructor() {
        this.type = 0;
        this.x = 0;
        this.y = 0;
    }
    static preload(loader) {
        loader.load.path = "/assets/map/objects/trees/";
        loader.load.image("tree1", "tree_1.png");
        loader.load.image("tree2", "tree_2.png");
        loader.load.image("tree3", "tree_3.png");
        loader.load.image("tree4", "tree_4.png");
    }

    create(currentScene, objData, cellSize) {
        this.x = objData.X;
        this.y = objData.Y;
        this.type = objData.ObjectType;
        var x = this.x * cellSize + cellSize / 2;
        var y = this.y * cellSize;
        const sprite = currentScene.add.sprite(x, y, "tree" + Math.min(this.type + 1, 4));
        sprite.depth = y + sprite.height / 2;
        this.sprite = sprite;
    }
}
class MapObject {
    type = 0;
    x = 0;
    y = 0;
    sprite: Phaser.GameObjects.Sprite;

    static preload(loader: any) {
        loader.load.path = "/assets/map/objects/trees/";
        loader.load.image("tree1", "tree_1.png");
        loader.load.image("tree2", "tree_2.png");
        loader.load.image("tree3", "tree_3.png");
        loader.load.image("tree4", "tree_4.png");
    }

    create(currentScene: Phaser.Scene, objData: MapObjectData) {
        this.x = objData.x;
        this.y = objData.y;
        this.type = objData.objecttype;

        var x = this.x * WorldMap.cellSize + WorldMap.cellSize/2;
        var y = this.y * WorldMap.cellSize;
        const sprite = currentScene.add.sprite(
            x,
            y,
            "tree" + Math.min(this.type + 1, 4));

        sprite.depth = y + sprite.height/2;

        this.sprite = sprite;
    }
}
export default class AnimationDef3D {
  key: string;
  framesCount: number;
  frameWidth: number;
  frameHeight: number;
  rows: number;
  cols: number;

  constructor(
    key: string,
    count: number,
    frameWidth: number = 100,
    frameHeight: number = 100,
    rows: number = 1,
    cols: number = count
  ) {
    this.key = key;
    this.framesCount = count;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.rows = rows;
    this.cols = cols;
  }
}

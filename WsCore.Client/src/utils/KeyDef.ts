export default class KeyDef {
    code: number;
    isDown: boolean;
    isUp: boolean;
    press: () => void;
    release: () => void;
    downHandler: (event: any) => void;
    upHandler: (event: any) => void;
}
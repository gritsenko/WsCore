class ReadBuffer {
    static LittleEndian = true;

    inputBufferView: DataView;
    inputBufferOffset : number;

    setInput(data) {
        this.inputBufferView = new DataView(data);
        this.inputBufferOffset = 0;
        return this;
    }

    popString() {
        var size = this.inputBufferView.getInt32(this.inputBufferOffset, ReadBuffer.LittleEndian);
        this.inputBufferOffset += 4;
        var arr = new Uint8Array(size);
        for (var i = 0; i < size; i++) {
            arr[i] = this.inputBufferView.getUint8(this.inputBufferOffset + i);
        }

        var str = this.utf8ArrayToStr(arr);
        this.inputBufferOffset += size;
        return str;
    }

    popStringFixedLength(length:number) {
        const arr = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.inputBufferView.getUint8(this.inputBufferOffset + i);
        }

        const str = this.utf8ArrayToStr(arr);
        this.inputBufferOffset += length;
        return str;
    }

    utf8ArrayToStr(array) {
        var out, i, len, c;
        var char2, char3;

        out = "";
        len = array.length;
        i = 0;
        while (i < len) {
            c = array[i++];
            switch (c >> 4) {
                case 0:
                    break;
                case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                // 0xxxxxxx
                out += String.fromCharCode(c);
                break;
            case 12: case 13:
                // 110x xxxx   10xx xxxx
                char2 = array[i++];
                out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                break;
            case 14:
                // 1110 xxxx  10xx xxxx  10xx xxxx
                char2 = array[i++];
                char3 = array[i++];
                out += String.fromCharCode(((c & 0x0F) << 12) |
                    ((char2 & 0x3F) << 6) |
                    ((char3 & 0x3F) << 0));
                break;
            }
        }

        return out;
    }

    popInt8() {
        var result = this.inputBufferView.getInt8(this.inputBufferOffset);
        this.inputBufferOffset += 1;
        return result;
    }

    popInt16() {
        const result = (this.inputBufferView.getInt16(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 2;
        return result;
    }

    popInt32() {
        const result = (this.inputBufferView.getInt32(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 4;
        return result;
    }

    popUInt8() {
        const result = (this.inputBufferView.getUint8(this.inputBufferOffset));
        this.inputBufferOffset += 1;
        return result;
    }

    popUInt16() {
        const result = (this.inputBufferView.getUint16(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 2;
        return result;
    }

    popUInt32() {
        const result = (this.inputBufferView.getUint32(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 4;
        return result;
    }

    popFloat() {
        const result = (this.inputBufferView.getFloat32(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 4;
        return result;
    }
}
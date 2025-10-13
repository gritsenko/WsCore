var WriteBuffer = /** @class */ (function () {
    function WriteBuffer() {
        this.outputBufferLen = 0;
        this.newMessage();
    }
    WriteBuffer.prototype.newMessage = function () {
        this.outputBuffer = [];
        this.outputBufferLen = 0;
        return this;
    };
    WriteBuffer.prototype.pushToBuffer = function (value, size, callback) {
        this.outputBuffer.push({
            "size": size,
            "value": value,
            "callback": callback
        });
        this.outputBufferLen += size;
    };
    WriteBuffer.prototype.pushString = function (value, length) {
        var utf8 = this.toUtf8Array(value);
        console.log("setting buffer string: " + value);
        this.pushToBuffer(utf8, length, this.setFixedByteArray);
        return this;
    };
    WriteBuffer.prototype.pushInt8 = function (value) {
        this.pushToBuffer(value, 1, this.setInt);
        return this;
    };
    WriteBuffer.prototype.pushInt16 = function (value) {
        this.pushToBuffer(value, 2, this.setInt);
        return this;
    };
    WriteBuffer.prototype.pushInt32 = function (value) {
        this.pushToBuffer(value, 4, this.setInt);
        return this;
    };
    WriteBuffer.prototype.pushUInt8 = function (value) {
        this.pushToBuffer(value, 1, this.setUint);
        return this;
    };
    WriteBuffer.prototype.pushUInt16 = function (value) {
        this.pushToBuffer(value, 2, this.setUint);
        return this;
    };
    WriteBuffer.prototype.pushUInt32 = function (value) {
        this.pushToBuffer(value, 4, this.setUint);
        return this;
    };
    WriteBuffer.prototype.pushFloat = function (value) {
        this.pushToBuffer(value, 4, this.setFloat);
        return this;
    };
    WriteBuffer.prototype.setInt = function (buffView, value, size, offset) {
        if (size === 1) {
            buffView.setInt8(offset, value, WriteBuffer.littleEndian);
        }
        if (size === 2) {
            buffView.setInt16(offset, value, WriteBuffer.littleEndian);
        }
        if (size === 4) {
            buffView.setInt32(offset, value, WriteBuffer.littleEndian);
        }
    };
    WriteBuffer.prototype.setFloat = function (buffView, value, size, offset) {
        if (size === 4) {
            buffView.setFloat32(offset, value, WriteBuffer.littleEndian);
        }
    };
    WriteBuffer.prototype.setUint = function (buffView, value, size, offset) {
        if (size === 1) {
            buffView.setUint8(offset, value, WriteBuffer.littleEndian);
        }
        if (size === 2) {
            buffView.setUint16(offset, value, WriteBuffer.littleEndian);
        }
        if (size === 4) {
            buffView.setUint32(offset, value, WriteBuffer.littleEndian);
        }
    };
    WriteBuffer.prototype.toHexString = function (byteArray) {
        return byteArray.map(function (byte) { return ("0" + (byte & 0xFF).toString(16)).slice(-2); }).join("-");
    };
    WriteBuffer.prototype.toUtf8Array = function (str) {
        var utf8 = [];
        for (var i = 0; i < str.length; i++) {
            var charcode = str.charCodeAt(i);
            if (charcode < 0x80)
                utf8.push(charcode);
            else if (charcode < 0x800) {
                utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
            }
            else if (charcode < 0xd800 || charcode >= 0xe000) {
                utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
            }
            // surrogate pair
            else {
                i++;
                // UTF-16 encodes 0x10000-0x10FFFF by
                // subtracting 0x10000 and splitting the
                // 20 bits of 0x0-0xFFFFF into two halves
                charcode = 0x10000 + (((charcode & 0x3ff) << 10)
                    | (str.charCodeAt(i) & 0x3ff));
                utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
            }
        }
        return utf8;
    };
    WriteBuffer.prototype.setByteArray = function (buffView, value, size, offset) {
        //set length of following array
        buffView.setInt16(offset, value.length);
        for (var i = 0; i < value.length; i++) {
            buffView.setUint8(offset + i, value[i]);
        }
    };
    WriteBuffer.prototype.setFixedByteArray = function (buffView, value, size, offset) {
        var len = value.length;
        for (var i = 0; i < size; i++) {
            if (i < len)
                buffView.setUint8(offset + i, value[i]);
            else
                buffView.setUint8(offset + i, 0);
        }
    };
    WriteBuffer.prototype.send = function (ws) {
        if (!ws || ws.readyState !== 1 /* OPEN */)
            return;
        var outputBufferArray = new ArrayBuffer(this.outputBufferLen);
        var dataView = new DataView(outputBufferArray);
        var curOffset = 0;
        for (var i = 0, maxIndex = this.outputBuffer.length; i < maxIndex; i++) {
            var item = this.outputBuffer[i];
            item.callback(dataView, item.value, item.size, curOffset);
            curOffset += item.size;
        }
        ws.send(outputBufferArray);
        this.outputBuffer = [];
        this.outputBufferLen = 0;
    };
    WriteBuffer.littleEndian = true;
    return WriteBuffer;
}());
export default WriteBuffer;
//# sourceMappingURL=WriteBuffer.js.map
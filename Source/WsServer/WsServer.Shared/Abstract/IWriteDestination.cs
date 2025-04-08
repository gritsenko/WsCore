using System;
using System.Collections.Generic;

namespace WsServer.Abstract;

public interface IWriteDestination
{
    void SetUint8(byte value);
    void SetUint16(UInt16 value);
    void SetUint32(UInt32 value);
    void SetInt8(sbyte value);
    void SetInt16(Int16 value);
    void SetInt32(Int32 value);
    void SetInt64(Int64 value);
    void SetFloat(float value);
    void SetString(string str, int fixedLength = 0);
    void SetNumber(object val);
    void SetCollection<TItem>(IEnumerable<TItem> items);
}
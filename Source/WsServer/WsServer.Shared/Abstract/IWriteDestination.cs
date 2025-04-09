using System.Collections.Generic;

namespace WsServer.Abstract;

public interface IWriteDestination
{
    IWriteDestination SetUint8(byte value);
    IWriteDestination SetUint16(ushort value);
    IWriteDestination SetUint32(uint value);
    IWriteDestination SetInt8(sbyte value);
    IWriteDestination SetInt16(short value);
    IWriteDestination SetInt32(int value);
    IWriteDestination SetInt64(long value);
    IWriteDestination SetFloat(float value);
    IWriteDestination SetString(string str, int fixedLength = 0);
    IWriteDestination SetNumber(object val);
    IWriteDestination SetCollection<TItem>(IEnumerable<TItem> items);
}
namespace WsServer.DataBuffer.Abstract;

public interface IDataBuffer
{
    IDataBuffer SetUint8(byte value);
    IDataBuffer SetUint16(ushort value);
    IDataBuffer SetUint32(uint value);
    IDataBuffer SetInt8(sbyte value);
    IDataBuffer SetInt16(short value);
    IDataBuffer SetInt32(int value);
    IDataBuffer SetInt64(long value);
    IDataBuffer SetFloat(float value);
    IDataBuffer SetString(string str, int fixedLength = 0);
    IDataBuffer SetNumber(object val);
    IDataBuffer SetCollection<TItem>(IEnumerable<TItem> items);
}
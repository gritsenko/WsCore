using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer;

public class MessageSerializer : IMessageSerializer
{
    private readonly DefaultMessageDataWriterBase _defaultMessageWriter;
    private readonly IServerLogicProvider _serverLogicProvider;

    public MessageSerializer(IServerLogicProvider serverLogicProvider)
    {
        _serverLogicProvider = serverLogicProvider;
        _defaultMessageWriter = new DefaultMessageDataWriterBase(Write);
    }

    public void Serialize<TEventMessage>(MyBuffer buff, TEventMessage message) where TEventMessage : IServerEvent
    {
        var messageType = _serverLogicProvider.ServerEvents.FindIdByType(typeof(TEventMessage));
        buff.SetUint8(messageType);
        var wrapper = new MyBufferWrapper(buff, Write);
        Write(wrapper, message);
    }

    private void Write(IWriteDestination dest, object item)
    {
        var itemType = item.GetType();
        var writer = _serverLogicProvider.GetWriter(itemType) ?? _defaultMessageWriter;
        writer.Write(dest, item);
    }

    public IClientRequest Deserialize(ref byte[] data, out byte messageTypeId)
    {
        if (data == null || data.Length == 0)
            throw new ArgumentException("data is null or zero length");

        messageTypeId = data[0];
        var structureType = _serverLogicProvider.ClientRequests.FindTypeById(messageTypeId);

        if (structureType == null)
            throw new ArgumentException($"Unknown message type ID: {messageTypeId}");

        var size = Marshal.SizeOf(structureType);

        if (data.Length - 1 < size)
            throw new ArgumentException("Payload size is less than structure size");

        var payload = new ArraySegment<byte>(data, 1, size);
        IntPtr ptr = Marshal.AllocHGlobal(size);

        try
        {
            Marshal.Copy(payload.Array, payload.Offset, ptr, size);
            return (IClientRequest)Marshal.PtrToStructure(ptr, structureType);
        }
        finally
        {
            Marshal.FreeHGlobal(ptr);
        }
    }

    class MyBufferWrapper(MyBuffer buff, Action<IWriteDestination, object> write) : IWriteDestination
    {
        public void SetUint8(byte value) => buff.SetUint8(value);

        public void SetUint16(ushort value) => buff.SetUint16(value);

        public void SetUint32(uint value) => buff.SetUint32(value);

        public void SetInt8(sbyte value) => buff.SetInt8(value);

        public void SetInt16(short value) => buff.SetInt16(value);

        public void SetInt32(int value) => buff.SetInt32(value);

        public void SetInt64(long value) => buff.SetInt64(value);

        public void SetFloat(float value) => buff.SetFloat(value);

        public void SetString(string str, int fixedLength = 0) => _ = fixedLength > 0 ? buff.SetFixedLengthString(str, fixedLength) : buff.SetString(str);

        public void SetNumber(object val)
        {
            switch (val)
            {
                case sbyte i8:
                    SetInt8(i8);
                    break;
                case Int16 i16:
                    SetInt16(i16);
                    break;
                case Int32 i32:
                    SetInt32(i32);
                    break;
                case Int64 i64:
                    SetInt64(i64);
                    break;
                case byte ui8:
                    SetUint8(ui8);
                    break;
                case UInt16 ui16:
                    SetUint16(ui16);
                    break;
                case UInt32 ui32:
                    SetUint32(ui32);
                    break;
                case float fl:
                    SetFloat(fl);
                    break;
            }
        }

        public void SetCollection<TItem>(IEnumerable<TItem> items)
        {
            var lenIndex = buff.Index;
            buff.Index += 4;

            uint len = 0;
            foreach (var item in items)
            {
                write(this, item);
                len++;
            }

            //write size of the collection at the beginning of collection definition
            buff.SetUint32AtIndex(len, lenIndex);
        }
    }
}

public class DefaultMessageDataWriterBase(Action<IWriteDestination, object> writeAction) : MessageDataWriterBase
{
    public override void Write(IWriteDestination dest, object obj)
    {
        var typeInfo = obj.GetType();

        //if object is number or string
        if (!typeInfo.IsValueType || typeInfo.IsPrimitive)
            dest.SetNumber(obj);

        //if object is structure
        var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);
        foreach (var info in infos)
        {
            var val = info.GetValue(obj);

            switch (val)
            {
                case string str:
                    dest.SetString(str, GetFieldLength(info));
                    break;
                case Array arr:
                {
                    dest.SetUint32((uint)arr.Length);

                    foreach (var item in arr)
                        writeAction(dest, item);
                    break;
                }
                default:
                    writeAction(dest, val);
                    break;
            }
        }
    }

    public int GetFieldLength(FieldInfo info) => info.GetCustomAttribute<MarshalAsAttribute>()?.SizeConst ?? 0;
}
﻿using System.Reflection;
using System.Runtime.InteropServices;
using WsServer.DataBuffer.Abstract;

namespace WsServer.DataBuffer.Writers;

public sealed class SimpleDataBufferBufferWriter(Action<IDataBuffer, object> writeAction) : DataBufferBufferWriterBase
{
    public override void Write(IDataBuffer dest, object obj)
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
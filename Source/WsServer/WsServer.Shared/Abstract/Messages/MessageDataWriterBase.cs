using System;
using System.Collections.Generic;
using System.Reflection;
using WsServer.Common;

namespace WsServer.Abstract.Messages;

public class MessageDataWriterBase<TMessageData> : MessageDataWriterBase where TMessageData : IMessageData
{
    public virtual void Write(MyBuffer destBuffer, TMessageData data)
    {
        base.Write(destBuffer, data);
    }
}

public class DefaultMessageDataWriterBase : MessageDataWriterBase
{
    public DefaultMessageDataWriterBase(Func<Type, IMessageDataWriter> messageDataWriterProvider) => SetMessageDataWriterProvider(messageDataWriterProvider);
}

public class MessageDataWriterBase : IMessageDataWriter
{
    protected Func<Type, IMessageDataWriter> _messageDataWriterProvider;

    public void SetMessageDataWriterProvider(Func<Type, IMessageDataWriter> messageDataProvider) => _messageDataWriterProvider = messageDataProvider;

    public virtual void Write(MyBuffer buff, object data)
    {
        SetData(buff, data);
    }

    protected void SetData(MyBuffer buff, object obj, int fixedLength = 0)
    {
        var typeInfo = obj.GetType();

        var writer = _messageDataWriterProvider(typeInfo);
        if (writer.CanWrite(obj))
        {
            writer.Write(buff, obj);
            return;
        }

        if (!typeInfo.IsValueType || typeInfo.IsPrimitive || obj is string)
            buff.SetPrimitive(obj, fixedLength);

        //if structure
        var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);
        foreach (var info in infos)
        {
            var val = info.GetValue(obj);

            if (info.FieldType.IsArray)
            {
                buff.SetUint32((uint)((Array)val).Length);

                foreach (var item in (Array)val)
                    SetData(buff, item);
                continue;
            }

            SetData(buff, val, val is string ? buff.GetFieldLength(info) : 0);
        }
    }

    public void SetCollection<TItem>(MyBuffer buff, IEnumerable<TItem> items)
    {
        var lenIndex = buff.Index;
        buff.Index += 4;

        uint len = 0;
        foreach (var item in items)
        {
            SetData(buff, item);
            len++;
        }

        //write size of the collection at the beginning of collection definition
        buff.SetUint32AtIndex(len, lenIndex);
    }
}

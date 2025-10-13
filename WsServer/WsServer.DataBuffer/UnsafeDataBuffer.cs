using System.Text;
using WsServer.DataBuffer.Abstract;

namespace WsServer.DataBuffer;

public class UnsafeDataBuffer : IDataBuffer
{
    internal int Index
    {
        get => _index;
        set
        {
            _index = value;
            CheckBoundaries(_index);
        }
    }

    public byte[] buffer;
    int curLen = 0;
    private int _index = 0;
    private readonly Action<IDataBuffer, object> _writeItemAction; //must be set before write any collection

    public UnsafeDataBuffer(Action<IDataBuffer, object> writeItemAction, int size = 1024)
    {
        _writeItemAction = writeItemAction;
        buffer = new byte[size];
        curLen = buffer.Length;
    }

    private void CheckBoundaries(int index)
    {
        if (index + 64 >= curLen) ExpandBuffer(curLen + 64);
    }

    private void ExpandBuffer(int newSize)
    {
        curLen = newSize;
        Array.Resize(ref buffer, newSize);
    }

    public IDataBuffer Clear()
    {
        Array.Clear(buffer, 0, buffer.Length);
        Index = 0;
        return this;
    }

    public unsafe IDataBuffer SetUint8(byte value)
    {
        fixed (byte* p = &buffer[Index])
            *p = value;
        Index++;
        return this;
    }

    public unsafe IDataBuffer SetUint16(ushort value)
    {
        fixed (byte* p = &buffer[Index])
            *(ushort*)p = value;
        Index++;
        return this;
    }

    public unsafe IDataBuffer SetUint32(uint value)
    {
        fixed (byte* p = &buffer[Index])
            *(uint*)p = value;
        Index += 4;
        return this;
    }
    public unsafe IDataBuffer SetInt8(sbyte value)
    {
        fixed (byte* p = &buffer[Index])
            *(sbyte*)p = value;
        Index++;
        return this;
    }
    public unsafe IDataBuffer SetInt16(short value)
    {
        fixed (byte* p = &buffer[Index])
            *(short*)p = value;
        Index++;
        return this;
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveOptimization)]
    public unsafe IDataBuffer SetInt32(int value)
    {
        fixed (byte* p = &buffer[Index])
            *(int*)p = value;
        Index += 4;
        return this;
    }
    public unsafe IDataBuffer SetInt64(long value)
    {
        fixed (byte* p = &buffer[Index])
            *(long*)p = value;
        Index += 8;
        return this;
    }


    public unsafe IDataBuffer SetFloat(float value)
    {
        var val = *(uint*)&value;

        SetUint8((byte)(val & 0xFF));
        SetUint8((byte)(val >> 8 & 0xFF));
        SetUint8((byte)(val >> 16 & 0xFF));
        SetUint8((byte)(val >> 24 & 0xFF));
        return this;
    }

    public IDataBuffer SetString(string str, int fixedLength = 0)
    {
        if (fixedLength > 0)
            return SetFixedLengthString(str, fixedLength);

        if (string.IsNullOrEmpty(str))
        {
            SetInt32(0);
            return this;
        }
        var bytes = Encoding.UTF8.GetBytes(str);
        var cnt = bytes.Length;

        CheckBoundaries(_index + cnt);

        SetInt32(cnt);

        SetBytes(bytes);
        return this;
    }
    private IDataBuffer SetFixedLengthString(string str, int fixedLength)
    {
        if (string.IsNullOrEmpty(str) && fixedLength == 0)
        {
            return this;
        }

        if (string.IsNullOrEmpty(str) && fixedLength > 0)
        {
            for (var i = 0; i < fixedLength; i++)
            {
                SetUint8(0);
            }
        }

        if (str.Length > fixedLength)
        {
            str = str.Substring(0, fixedLength);
        }


        var bytes = Encoding.UTF8.GetBytes(str);
        var cnt = bytes.Length;

        CheckBoundaries(_index + cnt);
        SetBytes(bytes);

        var diff = fixedLength - cnt;
        if (diff > 0)
        {
            for (var i = 0; i < diff; i++)
            {
                SetUint8(0);
            }
        }
        return this;
    }

    private void SetBytes(byte[] bytes)
    {
        var len = bytes.Length;
        Buffer.BlockCopy(bytes, 0, buffer, Index, len);
        Index += len;
    }

    public ArraySegment<byte> AsArraySegment() => new(buffer, 0, Index);

    public virtual IDataBuffer SetCollection<TItem>(IEnumerable<TItem> items)
    {
        if (items is IList<TItem> list)
            WriteList(list);
        else
            WriteGenericCollection(items);

        return this;
    }

    private void WriteList<T>(IList<T> items)
    {
        SetInt32(items.Count);


        // avoid allocations by using for loop instead of foreach
        if (items is List<T> list)
        {
            for (int i = 0; i < list.Count; i++)
            {
                _writeItemAction.Invoke(this, list[i]);
            }
        }
        else if (items is T[] array)
        {
            for (int i = 0; i < array.Length; i++)
            {
                _writeItemAction.Invoke(this, array[i]);
            }
        }
        else
        {
            // Fallback для других реализаций IList<T>
            for (int i = 0; i < items.Count; i++)
            {
                _writeItemAction.Invoke(this, items[i]);
            }
        }
    }

    private void WriteGenericCollection<TItem>(IEnumerable<TItem> items)
    {
        var lenIndex = Index;
        Index += 4;

        uint len = 0;
        foreach (var item in items)
        {
            _writeItemAction.Invoke(this, item);
            len++;
        }

        //write size of the collection at the beginning of collection definition
        unsafe
        {
            fixed (byte* p = &buffer[lenIndex])
                *(uint*)p = len;
        }
    }

    public IDataBuffer SetNumber(object val) =>
        val switch
        {
            sbyte i8 => SetInt8(i8),
            short i16 => SetInt16(i16),
            int i32 => SetInt32(i32),
            long i64 => SetInt64(i64),
            byte ui8 => SetUint8(ui8),
            ushort ui16 => SetUint16(ui16),
            uint ui32 => SetUint32(ui32),
            float fl => SetFloat(fl),
            _ => throw new ArgumentException("Number of unsupported type!")
        };

}
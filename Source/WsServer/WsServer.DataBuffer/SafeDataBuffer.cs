using System.Buffers.Binary;
using System.Runtime.InteropServices;
using System.Text;
using WsServer.DataBuffer.Abstract;

namespace WsServer.DataBuffer;

public class SafeDataBuffer : IDataBuffer
{
    private int _index;
    private byte[] _buffer;
    private Memory<byte> _bufferMemory;
    private readonly Action<IDataBuffer, object> _writeItemAction;

    public SafeDataBuffer(Action<IDataBuffer, object> writeItemAction, int size = 1024)
    {
        _writeItemAction = writeItemAction;
        _buffer = new byte[size];
        _bufferMemory = _buffer.AsMemory();
    }

    private void EnsureCapacity(int additionalSize)
    {
        if (_index + additionalSize > _buffer.Length)
        {
            Array.Resize(ref _buffer, _buffer.Length + Math.Max(additionalSize, 64));
            _bufferMemory = _buffer.AsMemory();
        }
    }

    public IDataBuffer Clear()
    {
        Array.Clear(_buffer, 0, _buffer.Length);
        _index = 0;
        return this;
    }

    public IDataBuffer SetUint8(byte value)
    {
        EnsureCapacity(1);
        _buffer[_index++] = value;
        return this;
    }

    public IDataBuffer SetUint16(ushort value)
    {
        EnsureCapacity(2);
        BinaryPrimitives.WriteUInt16LittleEndian(_buffer.AsSpan(_index), value);
        _index += 2;
        return this;
    }

    public IDataBuffer SetUint32(uint value)
    {
        EnsureCapacity(4);
        BinaryPrimitives.WriteUInt32LittleEndian(_buffer.AsSpan(_index), value);
        _index += 4;
        return this;
    }

    public IDataBuffer SetInt8(sbyte value)
    {
        EnsureCapacity(1);
        _buffer[_index++] = (byte)value;
        return this;
    }

    public IDataBuffer SetInt16(short value)
    {
        EnsureCapacity(2);
        BinaryPrimitives.WriteInt16LittleEndian(_buffer.AsSpan(_index), value);
        _index += 2;
        return this;
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveOptimization)]
    public IDataBuffer SetInt32(int value)
    {
        EnsureCapacity(4);
        BinaryPrimitives.WriteInt32LittleEndian(_buffer.AsSpan(_index), value);
        _index += 4;
        return this;
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveOptimization)]
    public IDataBuffer SetInt32_memory(int value)
    {
        EnsureCapacity(4);
        BinaryPrimitives.WriteInt32LittleEndian(_bufferMemory.Span.Slice(_index), value);
        _index += 4;
        return this;
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveOptimization)]
    public IDataBuffer SetInt32_Marshal(int value)
    {
        EnsureCapacity(4);
        //MemoryMarshal.Write(_buffer.AsSpan(_index), ref value);
        //BinaryPrimitives.WriteInt32LittleEndian(_buffer.AsSpan(_index), value);
        MemoryMarshal.Write(_bufferMemory.Span.Slice(_index), ref value);
        _index += 4;
        return this;
    }

    public IDataBuffer SetInt64(long value)
    {
        EnsureCapacity(8);
        BinaryPrimitives.WriteInt64LittleEndian(_buffer.AsSpan(_index), value);
        _index += 8;
        return this;
    }

    public IDataBuffer SetFloat(float value)
    {
        EnsureCapacity(4);
        var intValue = BitConverter.SingleToInt32Bits(value);
        BinaryPrimitives.WriteInt32LittleEndian(_buffer.AsSpan(_index), intValue);
        _index += 4;
        return this;
    }

    public IDataBuffer SetString(string str, int fixedLength = 0)
    {
        if (fixedLength > 0)
        {
            return SetFixedLengthString(str, fixedLength);
        }

        if (string.IsNullOrEmpty(str))
        {
            SetInt32(0);
            return this;
        }

        var bytes = Encoding.UTF8.GetBytes(str);
        SetInt32(bytes.Length);
        SetBytes(bytes);
        return this;
    }

    private IDataBuffer SetFixedLengthString(string str, int fixedLength)
    {
        var bytes = Encoding.UTF8.GetBytes(str ?? string.Empty);
        var length = Math.Min(bytes.Length, fixedLength);

        SetBytes(bytes.AsSpan(0, length));

        for (int i = length; i < fixedLength; i++)
        {
            SetUint8(0);
        }

        return this;
    }

    private void SetBytes(ReadOnlySpan<byte> bytes)
    {
        EnsureCapacity(bytes.Length);
        bytes.CopyTo(_buffer.AsSpan(_index));
        _index += bytes.Length;
    }

    public ArraySegment<byte> AsArraySegment() => new(_buffer, 0, _index);

    public IDataBuffer SetCollection<TItem>(IEnumerable<TItem> items)
    {
        if (items is ICollection<TItem> collection)
        {
            SetInt32(collection.Count);
            foreach (var item in collection)
            {
                _writeItemAction(this, item);
            }
        }
        else
        {
            var countIndex = _index;
            SetInt32(0); // Placeholder for count
            int count = 0;

            foreach (var item in items)
            {
                _writeItemAction(this, item);
                count++;
            }

            BinaryPrimitives.WriteInt32LittleEndian(_buffer.AsSpan(countIndex), count);
        }

        return this;
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
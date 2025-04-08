using System;
using System.Text;

namespace WsServer.Common;

public class MyBuffer
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

    public MyBuffer(int size = 1024)
    {
        buffer = new byte[size];
        curLen = buffer.Length;
    }

    private void CheckBoundaries(int index)
    {
        if (index + 64 > curLen)
        {
            ExpandBuffer(index + 64);
        }
    }

    private void ExpandBuffer(int newSize)
    {
        //Logger.Log("Expanding buffer to " + newSize);
        Array.Resize(ref buffer, newSize);
    }

    public MyBuffer Clear()
    {
        Array.Clear(buffer, 0, buffer.Length);
        Index = 0;
        return this;
    }

    public unsafe MyBuffer SetUint8(byte value)
    {
        fixed (byte* p = &buffer[Index])
            *((byte*)p) = value;
        Index++;
        return this;
    }

    public unsafe MyBuffer SetUint16(UInt16 value)
    {
        fixed (byte* p = &buffer[Index])
            *((UInt16*)p) = value;
        Index++;
        return this;
    }

    public unsafe MyBuffer SetUint32(UInt32 value)
    {
        fixed (byte* p = &buffer[Index])
            *((UInt32*)p) = value;
        Index += 4;
        return this;
    }
    public unsafe MyBuffer SetInt8(sbyte value)
    {
        fixed (byte* p = &buffer[Index])
            *((sbyte*)p) = value;
        Index++;
        return this;
    }
    public unsafe MyBuffer SetInt16(Int16 value)
    {
        fixed (byte* p = &buffer[Index])
            *((Int16*)p) = value;
        Index++;
        return this;
    }

    public unsafe MyBuffer SetInt32(Int32 value)
    {
        fixed (byte* p = &buffer[Index])
            *((Int32*)p) = value;
        Index += 4;
        return this;
    }
    public unsafe MyBuffer SetInt64(Int64 value)
    {
        fixed (byte* p = &buffer[Index])
            *((Int64*)p) = value;
        Index += 8;
        return this;
    }


    public unsafe MyBuffer SetFloat(float value)
    {
        var val = *((uint*)&value);

        SetUint8((byte)(val & 0xFF));
        SetUint8((byte)((val >> 8) & 0xFF));
        SetUint8((byte)((val >> 16) & 0xFF));
        SetUint8((byte)((val >> 24) & 0xFF));
        return this;
    }

    public MyBuffer SetString(string str)
    {
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
    public MyBuffer SetFixedLengthString(string str, int fixedLength)
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

    internal unsafe void SetUint32AtIndex(uint len, int index)
    {
        fixed (byte* p = &buffer[index])
            *(uint*)p = len;
    }
}
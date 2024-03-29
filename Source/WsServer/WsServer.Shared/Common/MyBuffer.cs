using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using WsServer.Abstract;
using WsServer.ServerMessages;

namespace WsServer.Common
{
    public class MyBuffer
    {
        private int Index
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
                ExapndBuffer(index + 64);
            }
        }

        private void ExapndBuffer(int newSize)
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
            //var floatArray1 = new[] { value };
            // create a byte array and copy the floats into it...
            //var byteArray = new byte[floatArray1.Length * 4];
            //Buffer.BlockCopy(floatArray1, 0, byteArray, 0, 4);
            //Buffer.BlockCopy(byteArray, 0, buffer, Index, 4);

            //var arr = BitConverter.GetBytes(value);

            var val = *((uint*)&value);

            SetUint8((byte)(val & 0xFF));
            SetUint8((byte)((val >> 8) & 0xFF));
            SetUint8((byte)((val >> 16) & 0xFF));
            SetUint8((byte)((val >> 24) & 0xFF));

            //fixed (byte* p = &buffer[Index])
            //    *((float*)p) = value;
            //Index += 4;
            return this;
        }

        public Task SendAsync(WebSocket socket)
        {
            var outgoing = new ArraySegment<byte>(buffer, 0, Index);
            return socket.SendAsync(outgoing, WebSocketMessageType.Binary, true, CancellationToken.None);
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

        public static MyBuffer Create(int size = 1024)
        {
            return new MyBuffer(size);
        }

        public MyBuffer SetData(object obj, int fixedLength = 0)
        {
            if (obj == null)
                return this;

            if (obj is ISelfSerializable ss)
            {
                ss.WriteToBuffer(this);
                return this;
            }

            var typeInfo = obj.GetType();
            if (!typeInfo.IsValueType || typeInfo.IsPrimitive || obj is string)
                SetPrimitive(obj, fixedLength);

            //if structure
            var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);
            foreach (var info in infos)
            {
                var val = info.GetValue(obj);

                if (info.FieldType.IsArray)
                {
                    SetUint32((uint) ((Array) val).Length);

                    foreach (var item in (Array) val)
                        SetData(item);
                    continue;
                }

                SetData(val, val is string ? GetFieldLenght(info) : 0);
            }

            return this;
        }

        public unsafe void SetCollection<TItem>(IEnumerable<TItem> items)
        {
            var lenIndex = Index;
            Index += 4;

            uint len = 0;
            foreach (var item in items)
            {
                SetData(item);
                len++;
            }

            //write length of collection
            fixed (byte* p = &buffer[lenIndex])
                *((UInt32*)p) = len;
        }

        public int GetFieldLenght(FieldInfo info)
        {
            try
            {
                var marshalAsAttribute = info.GetCustomAttribute<MarshalAsAttribute>();
                if (marshalAsAttribute != null)
                    return marshalAsAttribute.SizeConst;
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }

            return 0;
        }


        public void SetPrimitive(object val, int fixedLenght = 0)
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
                case string str:
                    if (fixedLenght > 0)
                        SetFixedLengthString(str,fixedLenght);
                    else
                        SetString(str);
                    break;
            }
        }

    }
}
using System.Collections.Concurrent;
using System.Linq.Expressions;
using System.Reflection;
using System.Runtime.InteropServices;
using WsServer.DataBuffer.Abstract;

namespace WsServer.DataBuffer.Writers;

public sealed class CachingDataBufferBufferWriter : DataBufferBufferWriterBase
{
    private readonly Action<IDataBuffer, object> _writeAction;
    private readonly ConcurrentDictionary<Type, TypeSerializer> _typeSerializers = new();

    public CachingDataBufferBufferWriter(Action<IDataBuffer, object> writeAction)
    {
        _writeAction = writeAction;
    }

    public override void Write(IDataBuffer dest, object obj)
    {
        if (obj == null) return;

        var type = obj.GetType();

        // Handle primitive types directly
        if (!type.IsValueType || type.IsPrimitive)
        {
            dest.SetNumber(obj);
            return;
        }

        // Get or create cached serializer for this type
        var serializer = _typeSerializers.GetOrAdd(type, CreateTypeSerializer);
        serializer.Serialize(dest, obj, _writeAction);
    }

    private TypeSerializer CreateTypeSerializer(Type type)
    {
        return new TypeSerializer(type);
    }

    // Inner class to handle type-specific serialization
    private class TypeSerializer
    {
        private readonly struct FieldInfo
        {
            public readonly Func<object, object> Getter;
            public readonly int FixedLength;
            public readonly bool IsString;
            public readonly bool IsArray;

            public FieldInfo(Func<object, object> getter, int fixedLength, bool isString, bool isArray)
            {
                Getter = getter;
                FixedLength = fixedLength;
                IsString = isString;
                IsArray = isArray;
            }
        }

        private readonly FieldInfo[] _fields;

        public TypeSerializer(Type type)
        {
            var fields = type.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            _fields = new FieldInfo[fields.Length];

            for (int i = 0; i < fields.Length; i++)
            {
                var field = fields[i];
                var getter = CreateGetter(type, field);
                var fixedLength = field.GetCustomAttribute<MarshalAsAttribute>()?.SizeConst ?? 0;
                var isString = field.FieldType == typeof(string);
                var isArray = field.FieldType.IsArray;

                _fields[i] = new FieldInfo(getter, fixedLength, isString, isArray);
            }
        }

        public void Serialize(IDataBuffer dest, object obj, Action<IDataBuffer, object> writeAction)
        {
            foreach (var field in _fields)
            {
                var value = field.Getter(obj);

                if (field.IsString)
                {
                    dest.SetString((string)value, field.FixedLength);
                }
                else if (field.IsArray && value is Array array)
                {
                    dest.SetUint32((uint)array.Length);

                    foreach (var item in array)
                    {
                        writeAction(dest, item);
                    }
                }
                else
                {
                    writeAction(dest, value);
                }
            }
        }

        private static Func<object, object> CreateGetter(Type type, System.Reflection.FieldInfo field)
        {
            // Create a parameter for the instance
            var instanceParam = Expression.Parameter(typeof(object), "instance");

            // Cast the instance to the correct type
            var instanceCast = Expression.Convert(instanceParam, type);

            // Access the field
            var fieldAccess = Expression.Field(instanceCast, field);

            // Convert the field value to object
            var fieldCast = Expression.Convert(fieldAccess, typeof(object));

            // Create and compile the lambda expression
            return Expression.Lambda<Func<object, object>>(fieldCast, instanceParam).Compile();
        }
    }
}
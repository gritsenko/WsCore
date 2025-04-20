using Game.ServerLogic.Chat.Events;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using WsServer;
using WsServer.Abstract.Messages;
using WsServer.DataBuffer.Abstract;

namespace WsClientBuilder;

public class TypeScriptClientBuilder(string outputPath)
{
    readonly ReflectionServerLogicProvider _serverLogicProvider = new(typeof(ChatMessageEvent).Assembly, null);
    public string Build()
    {
        _serverLogicProvider.Initialize();

        var sb = new StringBuilder();

        var writeBufferContent = File.ReadAllText("./ExtraFiles/WriteBuffer.ts");
        var readBufferContent = File.ReadAllText("./ExtraFiles/ReadBuffer.ts");

        sb.AppendLine(writeBufferContent);
        sb.AppendLine(readBufferContent);
        //sb.AppendLine("import WriteBuffer from \"./WriteBuffer.js\"");
        //sb.AppendLine("import ReadBuffer from \"./ReadBuffer.js\"");

        sb.AppendLine("//MessageType enum builder");
        BuildEnumDef(sb, "ServerEventType", _serverLogicProvider.ServerEventTypes);
        BuildEnumDef(sb, "ClientMessageType", _serverLogicProvider.RequestTypes);

        sb.AppendLine("//Data definitions");
        BuildTypeDefinitions(sb, _serverLogicProvider.MessageDataTypes);
        sb.AppendLine("//Server events definitions");
        BuildTypeDefinitions(sb, _serverLogicProvider.ServerEventTypes.GetTypes());
        sb.AppendLine("//Client requests");
        BuildTypeDefinitions(sb, _serverLogicProvider.RequestTypes.GetTypes());


        sb.AppendLine("export default class Wsc {");

        WriteConstructor(sb);

        sb.AppendLine("//Array reader");
        BuildArrayReader(sb);

        sb.AppendLine("//Data readers");
        BuildDataReaders(sb);

        sb.AppendLine("//Message readers");
        BuildMessageReaders(sb);

        sb.AppendLine("//Message senders");
        BuildMessageSenders(sb);

        sb.AppendLine("}");

        var result = sb.ToString();
        File.WriteAllText(Path.Combine(outputPath, "WsConnection.ts"), result, Encoding.UTF8);
        return result;
    }

    private void BuildEnumDef(StringBuilder sb, string name, ReflectionServerLogicProvider.MessageTypeRegistry typeRegistry)
    {
        sb.AppendLine("enum " + name + " {");
        sb.AppendLine(string.Join(",\r\n", typeRegistry
            .GetTypes()
            .OrderBy(typeRegistry.FindIdByType)
            .Select(t => $"{t.Name} = {typeRegistry.FindIdByType(t)}")));
        sb.AppendLine("};");
    }

    private void BuildTypeDefinitions(StringBuilder sb, IEnumerable<Type> types)
    {
        foreach (var t in types)
        {
            var infos = t.GetFields(BindingFlags.Public | BindingFlags.Instance);
            sb.AppendLine("export class " + t.Name + "{");

            foreach (var info in infos)
                sb.AppendLine($"{info.Name.FormatIdtoJs()} : {GetFieldTsType(info.FieldType)};");

            sb.AppendLine("}");
        }

    }

    private static void WriteConstructor(StringBuilder sb)
    {
        sb.Append(
            """
                 clientId = -1;
                 writeBuff = new WriteBuffer();
                 readBuff = new ReadBuffer();
                 ws : WebSocket;
                 overrideUrl : string;
                 serverUrl : string;
            
                constructor() {
                }
            
                connect(overrideUrl) {
                    this.overrideUrl = overrideUrl;
                    this.ws = this.createSocket();
                    this.ws.onmessage = e => this.processServerMessage(new ReadBuffer().setInput(e.data));
                }
                createSocket() {
                    const scheme = document.location.protocol == "https:" ? "wss" : "ws";
                    const port = document.location.port ? (":" + document.location.port) : "";
                    this.serverUrl = `${scheme}://${document.location.hostname}${port}/ws`;
            
                    this.ws = new WebSocket(this.overrideUrl == undefined ? this.serverUrl : this.overrideUrl);
                    this.ws.binaryType = "arraybuffer";
                    return this.ws;
                }

            """
            );
    }

    private void BuildArrayReader(StringBuilder sb)
    {
        sb.Append(
            """
            
                readArray<T>(buff: ReadBuffer, itemReader: (buff: ReadBuffer) => T): T[] {
                    const itemsCount = buff.popUInt32();
                    const items: T[] = [];
                    for (let i = 0; i < itemsCount; i++) {
                        items.push(itemReader(buff));
                    }
                    return items;
                }
            """
        );
    }

    private void BuildDataReaders(StringBuilder sb)
    {
        var type = typeof(IBufferSerializableData);
        var types = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(s => s.GetTypes())
            .Where(p => type.IsAssignableFrom(p) && !p.IsInterface);

        foreach (var t in types)
        {
            BuildDataReader(t, sb);
        }
    }

    private void BuildDataReader(Type typeInfo, StringBuilder sb)
    {
        var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);

        sb.AppendLine("read" + typeInfo.Name + "(buff){");
        sb.AppendLine("const obj = new " + typeInfo.Name + "();");

        foreach (var info in infos)
        {
            sb.AppendLine($"obj.{info.Name.FormatIdtoJs()} = {GetFieldReader(info.FieldType, GetFieldLenght(info))}");
        }

        sb.AppendLine("return obj;");
        sb.AppendLine("}");
    }

    private void BuildMessageReaders(StringBuilder sb)
    {
        var type = typeof(IServerEvent);
        var types = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(s => s.GetTypes())
            .Where(p => type.IsAssignableFrom(p) && !p.IsInterface);

        foreach (var t in types)
        {
            BuildMessageHandlers(t, sb);
        }

        sb.AppendLine("processServerMessage(buff){");
        sb.AppendLine("//getting server message type");
        sb.AppendLine("const serverMessageType = buff.popUInt8();");
        sb.AppendLine("switch(serverMessageType){");

        foreach (var t in types)
        {
            BuildMessageReader(t, sb);
        }

        sb.AppendLine(" }");
        sb.AppendLine("}");
    }

    private void BuildMessageHandlers(Type typeInfo, StringBuilder sb)
    {
        var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);
        sb.AppendLine("on" + typeInfo.Name + "(msg : " + typeInfo.Name + "){");
        sb.AppendLine("}");
    }

    private void BuildMessageReader(Type typeInfo, StringBuilder sb)
    {
        var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);

        sb.AppendLine("case ServerEventType." + typeInfo.Name + ":");

        var varName = FirstCharToLowerCase(typeInfo.Name);

        sb.AppendLine($"const {varName} = new {typeInfo.Name}();");

        foreach (var info in infos)
        {
            sb.AppendLine($"  {varName}.{info.Name.FormatIdtoJs()} = {GetFieldReader(info.FieldType, GetFieldLenght(info))}");
        }

        sb.AppendLine($"this.on{typeInfo.Name}({varName});");
        sb.AppendLine("break;");
    }

    private static string FirstCharToLowerCase(string str)
    {
        if (!string.IsNullOrEmpty(str) && char.IsUpper(str[0]))
            return str.Length == 1 ? char.ToLower(str[0]).ToString() : char.ToLower(str[0]) + str[1..];

        return str;
    }

    private string GetFieldReader(Type fieldType, int lenght = 0, string bufferVarName = "buff")
    {
        var typeName = GetFieldTypeName(fieldType);

        var readerFunc = $"{bufferVarName}.pop{typeName}();";

        if (typeName == "String")
        {
            if (lenght != 0)
                readerFunc = $"{bufferVarName}.popStringFixedLength({lenght});";
        }

        if (typeName == "Data")
        {
            readerFunc = "this.read" + fieldType.Name + "(" + bufferVarName + ");";
        }

        if (typeName == "Array")
        {
            var itemType = fieldType.GetElementType();

            var memberReader = GetFieldReader(itemType, 0, "b");

            readerFunc = "this.readArray(buff, b => { return " + memberReader + "});";
        }

        return readerFunc;
    }

    private void BuildMessageSenders(StringBuilder sb)
    {
        var type = typeof(IClientRequest);
        var types = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(s => s.GetTypes())
            .Where(p => type.IsAssignableFrom(p) && !p.IsInterface);

        foreach (var t in types)
        {
            BuildMessageSender(t, sb);
        }
    }

    private void BuildMessageSender(Type typeInfo, StringBuilder sb)
    {
        var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);

        var args = string.Join(",", infos.Select(x => x.Name.FormatIdtoJs() + " : " + GetFieldTsType(x.FieldType)));

        sb.AppendLine("send" + typeInfo.Name + "(" + args + "){");
        sb.AppendLine("this.writeBuff.newMessage()");

        sb.AppendLine($".pushUInt8(ClientMessageType.{typeInfo.Name})");

        foreach (var info in infos)
        {
            BuildFieldSender(info, sb);
        }

        sb.AppendLine(".send(this.ws);");
        sb.AppendLine("}");

    }

    private void BuildFieldSender(FieldInfo info, StringBuilder sb)
    {
        sb.AppendLine(GetPrimitiveSender(info));
    }

    public string GetPrimitiveSender(FieldInfo info)
    {
        var fieldType = info.FieldType;
        var name = info.Name;

        var typeSuffix = GetFieldTypeName(fieldType);

        var lenghtParam = "";
        if (fieldType == typeof(string))
        {
            lenghtParam = ", " + GetFieldLenght(info);
        }

        return $".push{typeSuffix}({name.FormatIdtoJs()}{lenghtParam})";
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
    private string GetFieldTypeName(Type fieldType)
    {
        var typeSuffix = " _Invalid type_ ";
        if (fieldType == typeof(sbyte))
            typeSuffix = "Int8";
        else if (fieldType == typeof(short))
            typeSuffix = "Int16";
        else if (fieldType == typeof(int))
            typeSuffix = "Int32";
        else if (fieldType == typeof(long))
            typeSuffix = "Int64";
        else if (fieldType == typeof(byte))
            typeSuffix = "UInt8";
        else if (fieldType == typeof(ushort))
            typeSuffix = "UInt16";
        else if (fieldType == typeof(uint))
            typeSuffix = "UInt32";
        else if (fieldType == typeof(float))
            typeSuffix = "Float";
        else if (fieldType == typeof(string))
            typeSuffix = "String";
        else if (typeof(Array).IsAssignableFrom(fieldType))
            typeSuffix = "Array";
        else if (typeof(IBufferSerializableData).IsAssignableFrom(fieldType))
            typeSuffix = "Data";

        return typeSuffix;
    }
    private string GetFieldTsType(Type fieldType)
    {
        var typeSuffix = " _Invalid type_ ";
        if (fieldType == typeof(sbyte))
            typeSuffix = "number";
        else if (fieldType == typeof(short))
            typeSuffix = "number";
        else if (fieldType == typeof(int))
            typeSuffix = "number";
        else if (fieldType == typeof(long))
            typeSuffix = "number";
        else if (fieldType == typeof(byte))
            typeSuffix = "number";
        else if (fieldType == typeof(ushort))
            typeSuffix = "number";
        else if (fieldType == typeof(uint))
            typeSuffix = "number";
        else if (fieldType == typeof(float))
            typeSuffix = "number";
        else if (fieldType == typeof(string))
            typeSuffix = "string";
        else if (typeof(Array).IsAssignableFrom(fieldType))
        {
            var elementType = fieldType.GetElementType();
            var name = GetFieldTsType(elementType);
            typeSuffix = name + "[]";
        }
        else if (typeof(IBufferSerializableData).IsAssignableFrom(fieldType))
            typeSuffix = fieldType.Name;

        return typeSuffix;
    }
}

public static class IdStringExtensions
{
    public static string FormatIdtoJs(this string str) => str;
}
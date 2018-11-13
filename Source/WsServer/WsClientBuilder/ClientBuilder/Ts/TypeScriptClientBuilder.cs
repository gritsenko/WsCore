using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientBuilder.Ts
{
    public class TypeScriptClientBuilder
    {
        private readonly string _outputPath;

        public TypeScriptClientBuilder(string outputPath)
        {
            _outputPath = outputPath;
        }

        public string Build()
        {
            var sb = new StringBuilder();

            sb.AppendLine("/// <reference path=\"ReadBuffer.ts\" />\r\n/// <reference path=\"WriteBuffer.ts\" />");

            sb.AppendLine("//MessageType enum builder");
            BuildEnumDef(sb, typeof(ServerMessageType));
            BuildEnumDef(sb, typeof(ClientMessageType));

            sb.AppendLine("//Data definitions");
            BuildTypeDefs<IMessageData>(sb);
            BuildTypeDefs<IServerMessage>(sb);
            BuildTypeDefs<IClientMessage>(sb);


            sb.AppendLine("class Wsc {");

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
            File.WriteAllText(Path.Combine(_outputPath, "WsConnection.ts"), result, Encoding.UTF8);
            return result;
        }

        private void BuildTypeDefs<TData>(StringBuilder sb)
        {
            var type = typeof(TData);
            var types = AppDomain.CurrentDomain.GetAssemblies()
                .SelectMany(s => s.GetTypes())
                .Where(p => type.IsAssignableFrom(p) && !p.IsInterface);

            foreach (var t in types)
            {
                BuildTypeDef(sb, t);
            }

        }

        private void BuildTypeDef(StringBuilder sb, Type typeInfo)
        {
            var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);

            sb.AppendLine("class " + typeInfo.Name + "{");

            foreach (var info in infos)
            {
                sb.AppendLine($"{info.Name.FormatIdtoJs()} : {GetFieldTsType(info.FieldType)};");
            }

            sb.AppendLine("}");

        }

        private void WriteConstructor(StringBuilder sb)
        {
            var str = "      " +
                      "\r\n     clientId = -1;" +
                      "\r\n     writeBuff = new WriteBuffer();" +
                      "\r\n     readBuff = new ReadBuffer();" +
                      "\r\n     ws : WebSocket;" +
                      "\r\n     overrideUrl : string;" +
                      "" +
                      "\r\n    constructor() {" +
                      "\r\n    }" +
                      "\r\n" +
                      "\r\n    connect(overrideUrl : string = null) {" +
                      "\r\n        this.ws = this.createSocket();" +
                      "\r\n        this.overrideUrl = overrideUrl;" +
                      "\r\n    }" +
                      "\r\n    createSocket() {" +
                      "\r\n        const scheme = document.location.protocol == \"https:\" ? \"wss\" : \"ws\";" +
                      "\r\n        const port = document.location.port ? (\":\" + document.location.port) : \"\";" +
                      "\r\n        const serverUrl = scheme + \"://\" + document.location.hostname + port + \"/ws\";" +
                      "\r\n" +
                      "\r\n        this.ws = new WebSocket(this.overrideUrl == undefined ? serverUrl : this.overrideUrl);" +
                      "\r\n        this.ws.binaryType = \"arraybuffer\";" +
                      "\r\n        this.ws.onmessage = e => this.processServerMessage(new ReadBuffer().setInput(e.data));" +
                      "\r\n        return this.ws;" +
                      "\r\n    }" +
                      "\r\n";
            sb.Append(str);
        }

        private void BuildEnumDef(StringBuilder sb, Type enumType)
        {
            sb.AppendLine("enum " + enumType.Name + " {");
            var pairs = new List<string>();
            foreach (var value in Enum.GetValues(enumType))
            {
                pairs.Add(Enum.GetName(enumType, value) + " = " + (int)value);
            }

            sb.AppendLine(string.Join(",\r\n", pairs));
            sb.AppendLine("};");
        }

        private void BuildArrayReader(StringBuilder sb)
        {
            sb.AppendLine("readArray(buff, itemReader){");
            sb.AppendLine("var itemsCount = buff.popUInt32();");
            sb.AppendLine("var items = [];");
            sb.AppendLine("for (let i = 0; i < itemsCount; i++) {");
            sb.AppendLine(" items.push(itemReader(buff));");
            sb.AppendLine(" }");
            sb.AppendLine(" return items;");
            sb.AppendLine("}");
        }

        private void BuildDataReaders(StringBuilder sb)
        {
            var type = typeof(IMessageData);
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
            var type = typeof(IServerMessage);
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
            var msgType = typeInfo.GetCustomAttribute<ServerMessageTypeAttribute>().ServerMessageType;
            var varId = msgType.ToString().FormatIdtoJs() + "Message";
            sb.AppendLine("on" + msgType + "(msg : "+ typeInfo.Name +"){");
            //sb.AppendLine("\tconsole.log(\"message handler for " + msgType + " is not implemented \");");
            sb.AppendLine("}");
        }

        private void BuildMessageReader(Type typeInfo, StringBuilder sb)
        {
            var infos = typeInfo.GetFields(BindingFlags.Public | BindingFlags.Instance);
            var msgType = typeInfo.GetCustomAttribute<ServerMessageTypeAttribute>().ServerMessageType;

            sb.AppendLine("case ServerMessageType." + msgType + ":");
            var varId = msgType.ToString().FormatIdtoJs() + "Message";
            sb.AppendLine("var " + varId + " = new " + typeInfo.Name + "();");

            foreach (var info in infos)
            {
                sb.AppendLine($"{varId}.{info.Name.FormatIdtoJs()} = {GetFieldReader(info.FieldType, GetFieldLenght(info))}");
            }

            sb.AppendLine("this.on" + msgType + "(" + varId + ");");
            sb.AppendLine("break;");
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
            var type = typeof(IClientMessage);
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
            var msgType = typeInfo.GetCustomAttribute<ClientMessageTypeAttribute>().ClientMessageType;

            var args = string.Join(",", infos.Select(x => x.Name.FormatIdtoJs() + " : " + GetFieldTsType(x.FieldType)));

            sb.AppendLine("send" + msgType + "(" + args + "){");
            sb.AppendLine("this.writeBuff.newMessage()");

            sb.AppendLine($".pushUInt8(ClientMessageType.{msgType})");

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
            else if (fieldType == typeof(Int16))
                typeSuffix = "Int16";
            else if (fieldType == typeof(Int32))
                typeSuffix = "Int32";
            else if (fieldType == typeof(Int64))
                typeSuffix = "Int64";
            else if (fieldType == typeof(byte))
                typeSuffix = "UInt8";
            else if (fieldType == typeof(UInt16))
                typeSuffix = "UInt16";
            else if (fieldType == typeof(UInt32))
                typeSuffix = "UInt32";
            else if (fieldType == typeof(float))
                typeSuffix = "Float";
            else if (fieldType == typeof(string))
                typeSuffix = "String";
            else if (typeof(Array).IsAssignableFrom(fieldType))
                typeSuffix = "Array";
            else if (typeof(IMessageData).IsAssignableFrom(fieldType))
                typeSuffix = "Data";

            return typeSuffix;
        }
        private string GetFieldTsType(Type fieldType)
        {
            var typeSuffix = " _Invalid type_ ";
            if (fieldType == typeof(sbyte))
                typeSuffix = "number";
            else if (fieldType == typeof(Int16))
                typeSuffix = "number";
            else if (fieldType == typeof(Int32))
                typeSuffix = "number";
            else if (fieldType == typeof(Int64))
                typeSuffix = "number";
            else if (fieldType == typeof(byte))
                typeSuffix = "number";
            else if (fieldType == typeof(UInt16))
                typeSuffix = "number";
            else if (fieldType == typeof(UInt32))
                typeSuffix = "number";
            else if (fieldType == typeof(float))
                typeSuffix = "number";
            else if (fieldType == typeof(string))
                typeSuffix = "string";
            else if (typeof(Array).IsAssignableFrom(fieldType))
                typeSuffix = fieldType.GetElementType().Name + "[]";
            else if (typeof(IMessageData).IsAssignableFrom(fieldType))
                typeSuffix = fieldType.Name;

            return typeSuffix;
        }
    }
}

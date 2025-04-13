using System;
using System.IO;
using WsClientBuilder;

Console.WriteLine("Building clients...");

var serverDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "TsClient");

var path = Path.Combine(serverDir, "wwwroot", "Scripts");
if (!Directory.Exists(path))
    Directory.CreateDirectory(path);
var clientBuilder = new TypeScriptClientBuilder(path);
var res = clientBuilder.Build();

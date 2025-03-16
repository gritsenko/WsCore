using System;
using System.IO;
using WsClientBuilder;

Console.WriteLine("Building clients...");

var serverDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "TsClient");

var path = Path.Combine(serverDir ?? Directory.GetCurrentDirectory(), "wwwroot", "Scripts");
if (!Directory.Exists(path))
    Directory.CreateDirectory(path);
//var clientBuilder = new JsClientBuilder(path);
var clientBuilder = new TypeScriptClientBuilder(path);
var res = clientBuilder.Build();

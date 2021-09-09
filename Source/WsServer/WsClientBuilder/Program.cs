using System;
using System.IO;
using WsServer.ClientBuilder.Js;
using WsServer.ClientBuilder.Ts;

namespace WsClientBuilder
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Building clients...");
            
            var serverDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "TsClient");

            var path = Path.Combine(serverDir ?? Directory.GetCurrentDirectory(), "wwwroot", "Scripts");
            if (!Directory.Exists(path))
                Directory.CreateDirectory(path);
            //var clientBuilder = new JsClientBuilder(path);
            var clientBuilder = new TypeScriptClientBuilder(path);
            var res = clientBuilder.Build();
        }
    }
}

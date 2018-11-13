using System;
using System.IO;
using WsServer.ClientBuilder.Ts;

namespace WsClientBuilder
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Building clients...");

            var serverDir = @"C:\Projects\Html5Games\WsServer\WsServer";

            var path = Path.Combine(serverDir ?? Directory.GetCurrentDirectory(), "wwwroot", "Scripts");
            if (!Directory.Exists(path))
                Directory.CreateDirectory(path);

            var clientBuilder = new TypeScriptClientBuilder(path);
            var res = clientBuilder.Build();
        }
    }
}

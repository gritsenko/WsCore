using System.IO;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using WsServer.Common;

namespace WsServer
{
    public class Program
    {
        public static void Main(string[] args)
        {
            //init game server
            WsServerBootstrap.Initialize();

            //init asp.net core (typescript client)
            BuildWebHost(args).Run();
        }

        public static IWebHost BuildWebHost(string[] args) =>
            WebHost.CreateDefaultBuilder(args)
                .UseKestrel()
                .UseContentRoot(Directory.GetCurrentDirectory())
                .UseIISIntegration()
                .UseStartup<Startup>()
                .UseUrls("http://*:5000/")
                .Build();
    }
}

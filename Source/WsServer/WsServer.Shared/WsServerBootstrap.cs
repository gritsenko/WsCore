using System;
using System.Collections.Generic;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer
{
    public static class WsServerBootstrap
    {
        private static readonly SimpleContainer Container = new SimpleContainer();

        public static void Initialize()
        {
            IoC.GetInstance = GetInstance;
            IoC.GetAllInstances = GetAllInstances;
            IoC.BuildUp = BuildUp;

            Container.RegisterSingleton<IGameServer, GameServer>();
            Container.RegisterSingleton<IGameMessenger, GameMessenger>();
        }

        private static object GetInstance(Type serviceType, string key)
        {
            return Container.GetInstance(serviceType, key);
        }

        private static IEnumerable<object> GetAllInstances(Type serviceType)
        {
            return Container.GetAllInstances(serviceType);
        }

        private static void BuildUp(object instance)
        {
            Container.BuildUp(instance);
        }
    }
}

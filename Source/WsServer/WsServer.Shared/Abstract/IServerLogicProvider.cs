using System;
using System.Collections.Generic;

namespace WsServer.Abstract;

public interface IServerLogicProvider
{
    IEnumerable<Type> GetRequestTypes();
    IEnumerable<Type> GetEventTypes();
    IEnumerable<Type> GetRequestHandlers();
}
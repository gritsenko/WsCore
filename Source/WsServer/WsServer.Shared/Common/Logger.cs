using System;

namespace WsServer.Common;

//using simlpe custom logger yet, for case if we won't need asp.net core
// todo: replace with something standard 
public class Logger
{
    public static void Log(string s)
    {
        Console.WriteLine(s);
    }
    public static void Log(Exception ex)
    {
        Console.WriteLine(ex.Message);
        Console.WriteLine(ex.StackTrace);
    }

}
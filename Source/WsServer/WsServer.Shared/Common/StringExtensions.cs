namespace WsServer.Common
{
    public static class StringExtensions
    {
        public static string FormatIdtoJs(this string str)
        {
            if (string.IsNullOrEmpty(str))
                return string.Empty;
            return char.ToLower(str[0]) + str.Substring(1).ToLower();
        }
    }
}

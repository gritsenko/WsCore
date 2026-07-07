using System.Text;

namespace WsServer;

/// <summary>
/// Sanitizes free-text client input (chat, names). Trims, strips control characters
/// (defuses log injection and broken client rendering), and caps the length (audit §2).
/// </summary>
public static class InputSanitizer
{
    public static string Clean(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        var sb = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (char.IsControl(ch))
                continue;
            sb.Append(ch);
            if (sb.Length >= maxLength)
                break;
        }

        return sb.ToString().Trim();
    }
}

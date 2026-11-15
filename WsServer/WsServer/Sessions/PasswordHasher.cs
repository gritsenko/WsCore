using System.Security.Cryptography;

namespace WsServer.Sessions;

/// <summary>
/// Password hashing for claimed accounts: PBKDF2-HMAC-SHA512 with a per-password salt,
/// stored as <c>pbkdf2-sha512$iterations$salt$hash</c> (base64) so the cost can be raised
/// later without invalidating existing hashes. Deliberately slow — never call it on the
/// tick thread (SessionManager runs it on the thread pool).
/// </summary>
public static class PasswordHasher
{
    private const string Scheme = "pbkdf2-sha512";
    private const int SaltBytes = 16;
    private const int HashBytes = 32;

    public static string Hash(string password, int iterations)
    {
        iterations = Math.Max(1, iterations);
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA512, HashBytes);
        return $"{Scheme}${iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != Scheme || !int.TryParse(parts[1], out var iterations) || iterations < 1)
            return false;
        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA512, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

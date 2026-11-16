using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace WsServer.Push;

/// <summary>
/// The server's VAPID key pair (RFC 8292): a P-256 key that signs the JWT every push
/// request carries; its public half is the <c>applicationServerKey</c> browsers bind
/// their subscriptions to. Both halves travel as base64url — the public key as the
/// 65-byte uncompressed point, the private key as the 32-byte scalar.
/// </summary>
public sealed class VapidKeys
{
    public string PublicKey { get; }
    public string PrivateKey { get; }
    private readonly ECParameters _parameters;

    private VapidKeys(ECParameters parameters)
    {
        _parameters = parameters;
        PublicKey = Base64Url.Encode(WebPushCrypto.EncodePoint(parameters.Q));
        PrivateKey = Base64Url.Encode(parameters.D!);
    }

    public static VapidKeys Generate()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return new VapidKeys(ecdsa.ExportParameters(includePrivateParameters: true));
    }

    /// <summary>Null when the strings are not a valid P-256 key pair.</summary>
    public static VapidKeys? TryParse(string? publicKey, string? privateKey)
    {
        try
        {
            if (string.IsNullOrEmpty(publicKey) || string.IsNullOrEmpty(privateKey))
                return null;
            var parameters = new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = WebPushCrypto.DecodePoint(Base64Url.Decode(publicKey)),
                D = Base64Url.Decode(privateKey),
            };
            if (parameters.D.Length != 32)
                return null;
            using var ecdsa = ECDsa.Create(parameters); // validates that D matches Q
            return new VapidKeys(parameters);
        }
        catch (Exception e) when (e is CryptographicException or FormatException or ArgumentException)
        {
            return null;
        }
    }

    /// <summary>
    /// The <c>Authorization</c> header for a push to <paramref name="endpoint"/>:
    /// <c>vapid t=&lt;ES256 JWT&gt;, k=&lt;public key&gt;</c>. The JWT's audience is the
    /// push service's origin; <paramref name="subject"/> is a contact (mailto: / https:).
    /// </summary>
    public string AuthorizationHeader(string endpoint, string subject, DateTimeOffset expires)
    {
        var audience = new Uri(endpoint).GetLeftPart(UriPartial.Authority);
        var header = Base64Url.Encode("""{"typ":"JWT","alg":"ES256"}"""u8);
        var claims = Base64Url.Encode(Encoding.UTF8.GetBytes(
            $$"""{"aud":{{Json(audience)}},"exp":{{expires.ToUnixTimeSeconds()}},"sub":{{Json(subject)}}}"""));
        var signingInput = header + "." + claims;

        using var ecdsa = ECDsa.Create(_parameters);
        // .NET signs in the IEEE P1363 (r || s) form JWS wants.
        var signature = ecdsa.SignData(Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256);
        return $"vapid t={signingInput}.{Base64Url.Encode(signature)}, k={PublicKey}";
    }

    private static string Json(string value) => System.Text.Json.JsonSerializer.Serialize(value);
}

/// <summary>
/// Message encryption for Web Push (RFC 8291, the "aes128gcm" content coding of RFC 8188):
/// an ephemeral ECDH key agreed with the subscription's key, mixed with its auth secret,
/// gives the content key and nonce; the body is one record.
/// </summary>
public static class WebPushCrypto
{
    /// <summary>The record size written into the header; one record must hold the whole message.</summary>
    private const int RecordSize = 4096;

    /// <summary>Largest plaintext that fits one record (padding delimiter + 16-byte tag).</summary>
    public const int MaxPayloadBytes = RecordSize - 17;

    /// <summary>
    /// Encrypts <paramref name="payload"/> for the subscription whose public key is
    /// <paramref name="p256dh"/> (65-byte point) and auth secret <paramref name="auth"/>.
    /// Returns the request body: header (salt, record size, ephemeral public key) +
    /// ciphertext.
    /// </summary>
    public static byte[] Encrypt(ReadOnlySpan<byte> payload, byte[] p256dh, byte[] auth,
        byte[]? salt = null, ECDiffieHellman? ephemeral = null)
    {
        if (payload.Length > MaxPayloadBytes)
            throw new ArgumentException("Push payload too large", nameof(payload));

        salt ??= RandomNumberGenerator.GetBytes(16);
        using var ownEphemeral = ephemeral == null ? ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256) : null;
        var server = ephemeral ?? ownEphemeral!;
        var serverPublic = EncodePoint(server.ExportParameters(false).Q);

        using var client = ECDiffieHellman.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = DecodePoint(p256dh),
        });
        var sharedSecret = server.DeriveRawSecretAgreement(client.PublicKey);

        // IKM = HKDF(salt = auth, ikm = ECDH secret, info = "WebPush: info\0" || ua_public || as_public)
        var keyInfo = Concat("WebPush: info\0"u8, p256dh, serverPublic);
        var ikm = HKDF.DeriveKey(HashAlgorithmName.SHA256, sharedSecret, 32, auth, keyInfo);
        var prk = HKDF.Extract(HashAlgorithmName.SHA256, ikm, salt);
        var cek = HKDF.Expand(HashAlgorithmName.SHA256, prk, 16, "Content-Encoding: aes128gcm\0"u8.ToArray());
        var nonce = HKDF.Expand(HashAlgorithmName.SHA256, prk, 12, "Content-Encoding: nonce\0"u8.ToArray());

        // One record: the payload, then the delimiter 0x02 ("last record", no padding).
        var plaintext = new byte[payload.Length + 1];
        payload.CopyTo(plaintext);
        plaintext[^1] = 2;

        var headerLength = 16 + 4 + 1 + serverPublic.Length;
        var body = new byte[headerLength + plaintext.Length + 16];
        salt.CopyTo(body, 0);
        BinaryPrimitives.WriteUInt32BigEndian(body.AsSpan(16), RecordSize);
        body[20] = (byte)serverPublic.Length;
        serverPublic.CopyTo(body, 21);

        using var aes = new AesGcm(cek, 16);
        aes.Encrypt(nonce, plaintext,
            body.AsSpan(headerLength, plaintext.Length),
            body.AsSpan(headerLength + plaintext.Length, 16));
        return body;
    }

    public static byte[] EncodePoint(ECPoint q)
    {
        var point = new byte[65];
        point[0] = 4;
        q.X!.CopyTo(point, 1);
        q.Y!.CopyTo(point, 33);
        return point;
    }

    public static ECPoint DecodePoint(byte[] point)
    {
        if (point.Length != 65 || point[0] != 4)
            throw new FormatException("Not an uncompressed P-256 point");
        return new ECPoint { X = point[1..33], Y = point[33..65] };
    }

    private static byte[] Concat(ReadOnlySpan<byte> a, byte[] b, byte[] c)
    {
        var result = new byte[a.Length + b.Length + c.Length];
        a.CopyTo(result);
        b.CopyTo(result, a.Length);
        c.CopyTo(result, a.Length + b.Length);
        return result;
    }
}

/// <summary>base64url without padding (what the Push API and JWTs use).</summary>
public static class Base64Url
{
    public static string Encode(ReadOnlySpan<byte> data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>Accepts padded / unpadded base64url (and plain base64). Throws FormatException.</summary>
    public static byte[] Decode(string text)
    {
        var s = text.Trim().Replace('-', '+').Replace('_', '/').TrimEnd('=');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
            case 1: throw new FormatException("Invalid base64url length");
        }
        return Convert.FromBase64String(s);
    }
}

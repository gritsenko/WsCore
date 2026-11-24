using System.Buffers.Binary;

namespace WsServer.Games;

/// <summary>
/// What a picture is, read from its first bytes: the type (by signature — never the
/// uploader's word) and its pixel size, for <c>og:image:width/height</c> and layout. PNG,
/// JPEG, WebP (lossy, lossless, extended) and GIF; anything else is not a picture to us.
/// </summary>
public static class ImageInfo
{
    public static (string ContentType, int Width, int Height)? Read(ReadOnlySpan<byte> d)
    {
        // PNG: signature, then IHDR's width / height (big-endian).
        if (d.Length >= 24 && d.StartsWith<byte>([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
            return ("image/png", (int)BinaryPrimitives.ReadUInt32BigEndian(d[16..]), (int)BinaryPrimitives.ReadUInt32BigEndian(d[20..]));

        // GIF: "GIF87a" / "GIF89a", then the logical screen size (little-endian).
        if (d.Length >= 10 && d[..3].SequenceEqual("GIF"u8))
            return ("image/gif", BinaryPrimitives.ReadUInt16LittleEndian(d[6..]), BinaryPrimitives.ReadUInt16LittleEndian(d[8..]));

        // WebP: RIFF....WEBP and one of three chunk kinds.
        if (d.Length >= 30 && d[..4].SequenceEqual("RIFF"u8) && d.Slice(8, 4).SequenceEqual("WEBP"u8))
        {
            var chunk = d.Slice(12, 4);
            if (chunk.SequenceEqual("VP8 "u8) && d.Length >= 30)
                return ("image/webp", BinaryPrimitives.ReadUInt16LittleEndian(d[26..]) & 0x3FFF,
                    BinaryPrimitives.ReadUInt16LittleEndian(d[28..]) & 0x3FFF);
            if (chunk.SequenceEqual("VP8L"u8) && d.Length >= 25)
            {
                var bits = BinaryPrimitives.ReadUInt32LittleEndian(d[21..]);
                return ("image/webp", (int)(bits & 0x3FFF) + 1, (int)((bits >> 14) & 0x3FFF) + 1);
            }
            if (chunk.SequenceEqual("VP8X"u8) && d.Length >= 30)
                return ("image/webp", (d[24] | d[25] << 8 | d[26] << 16) + 1, (d[27] | d[28] << 8 | d[29] << 16) + 1);
            return null;
        }

        // JPEG: walk the segments to the first start-of-frame.
        if (d.Length >= 4 && d[0] == 0xFF && d[1] == 0xD8)
        {
            var i = 2;
            while (i + 9 < d.Length)
            {
                if (d[i] != 0xFF) { i++; continue; }
                var marker = d[i + 1];
                if (marker is 0xD8 or 0x01 || marker is >= 0xD0 and <= 0xD7) { i += 2; continue; }
                var length = BinaryPrimitives.ReadUInt16BigEndian(d[(i + 2)..]);
                // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
                if (marker is >= 0xC0 and <= 0xCF && marker is not (0xC4 or 0xC8 or 0xCC))
                    return ("image/jpeg", BinaryPrimitives.ReadUInt16BigEndian(d[(i + 7)..]), BinaryPrimitives.ReadUInt16BigEndian(d[(i + 5)..]));
                if (length < 2) return null;
                i += 2 + length;
            }
            return ("image/jpeg", 0, 0); // a JPEG whose size we could not find: still a JPEG
        }
        return null;
    }

    public static string ExtensionOf(string contentType) => contentType switch
    {
        "image/png" => ".png",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        _ => ".jpg",
    };
}

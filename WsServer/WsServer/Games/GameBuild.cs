using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace WsServer.Games;

/// <summary>What unpacking a build produced.</summary>
public sealed record UnpackedBuild(string EntryPath, int Files, long Bytes, IReadOnlyList<string> Warnings);

/// <summary>A build that cannot be hosted; <see cref="Exception.Message"/> says why, for the uploader.</summary>
public sealed class BuildRejectedException(string message) : Exception(message);

/// <summary>
/// Turns an uploaded web build into a directory the games origin serves — the rules of the
/// jam portal (docs/web-build): a <c>.zip</c> with an HTML entry point (the shallowest
/// <c>index.html</c>, then any <c>.htm*</c>; one nested folder is fine) or a single
/// self-contained <c>.html</c>, which becomes <c>index.html</c>.
///
/// The archive is untrusted: entries that climb out of the directory (<c>..</c>, rooted
/// paths), symlinks and junk (<c>__MACOSX</c>) are refused or skipped, and the declared
/// sizes are not trusted — the bytes actually written are counted against the limits.
/// </summary>
public static class GameBuild
{
    public static bool IsAcceptedFileName(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext is ".zip" or ".html" or ".htm";
    }

    /// <summary>
    /// Unpacks <paramref name="upload"/> (named <paramref name="fileName"/>) into
    /// <paramref name="targetDir"/>, which must not exist yet. On any failure the directory
    /// is removed and <see cref="BuildRejectedException"/> is thrown.
    /// </summary>
    public static UnpackedBuild Unpack(string upload, string fileName, string targetDir,
        long maxUnpackedBytes, int maxFiles)
    {
        if (!IsAcceptedFileName(fileName))
            throw new BuildRejectedException("A web build must be a .zip archive or a single .html file");
        Directory.CreateDirectory(targetDir);
        try
        {
            var result = Path.GetExtension(fileName).Equals(".zip", StringComparison.OrdinalIgnoreCase)
                ? UnpackZip(upload, targetDir, maxUnpackedBytes, maxFiles)
                : CopyHtml(upload, targetDir, maxUnpackedBytes);
            return result with { Warnings = Warn(Path.Combine(targetDir, result.EntryPath)) };
        }
        catch
        {
            try { Directory.Delete(targetDir, recursive: true); } catch (IOException) { }
            throw;
        }
    }

    private static UnpackedBuild CopyHtml(string upload, string targetDir, long maxBytes)
    {
        var length = new FileInfo(upload).Length;
        if (length > maxBytes)
            throw new BuildRejectedException("The file is too large");
        File.Copy(upload, Path.Combine(targetDir, "index.html"));
        return new UnpackedBuild("index.html", 1, length, []);
    }

    private static UnpackedBuild UnpackZip(string upload, string targetDir, long maxBytes, int maxFiles)
    {
        ZipArchive archive;
        try { archive = ZipFile.OpenRead(upload); }
        catch (InvalidDataException) { throw new BuildRejectedException("The archive is not a valid .zip"); }

        using (archive)
        {
            var root = Path.GetFullPath(targetDir) + Path.DirectorySeparatorChar;
            var files = 0;
            long bytes = 0;
            var htmlFiles = new List<string>();
            var buffer = new byte[81920];

            foreach (var entry in archive.Entries)
            {
                var name = entry.FullName.Replace('\\', '/');
                if (name.EndsWith('/'))
                    continue; // a directory: created on demand
                if (IsJunk(name) || IsSymlink(entry))
                    continue;
                var relative = SafeRelativePath(name)
                    ?? throw new BuildRejectedException($"The archive has an unsafe path: {Shorten(name)}");

                if (++files > maxFiles)
                    throw new BuildRejectedException($"The build has more than {maxFiles} files");

                var path = Path.GetFullPath(Path.Combine(root, relative));
                if (!path.StartsWith(root, StringComparison.Ordinal))
                    throw new BuildRejectedException($"The archive has an unsafe path: {Shorten(name)}");
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);

                using (var input = entry.Open())
                using (var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write))
                {
                    int read;
                    while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        bytes += read;
                        if (bytes > maxBytes)
                            throw new BuildRejectedException($"The unpacked build is larger than {maxBytes / (1024 * 1024)} MB");
                        output.Write(buffer, 0, read);
                    }
                }

                var ext = Path.GetExtension(relative).ToLowerInvariant();
                if (ext is ".html" or ".htm")
                    htmlFiles.Add(relative);
            }

            var entryPath = PickEntry(htmlFiles)
                ?? throw new BuildRejectedException("The archive has no HTML entry point (index.html)");
            return new UnpackedBuild(entryPath, files, bytes, []);
        }
    }

    /// <summary>The shallowest index.html, else the shallowest .htm* — ties by name.</summary>
    public static string? PickEntry(IEnumerable<string> htmlFiles)
    {
        var all = htmlFiles.ToList();
        static int Depth(string p) => p.Count(c => c == '/');
        var index = all.Where(p => Path.GetFileName(p).Equals("index.html", StringComparison.OrdinalIgnoreCase))
            .OrderBy(Depth).ThenBy(p => p, StringComparer.Ordinal).FirstOrDefault();
        return index ?? all.OrderBy(Depth).ThenBy(p => p, StringComparer.Ordinal).FirstOrDefault();
    }

    /// <summary>
    /// The entry as a clean relative path ('/'-separated, no empty / '.' / '..' segments,
    /// not rooted), or null when it is not one.
    /// </summary>
    public static string? SafeRelativePath(string name)
    {
        if (string.IsNullOrEmpty(name) || name.StartsWith('/') || name.Contains(':') || name.Contains('\0'))
            return null;
        var parts = name.Split('/');
        if (parts.Any(p => p.Length == 0 || p == "." || p == ".."))
            return null;
        return string.Join('/', parts);
    }

    private static bool IsJunk(string name)
        => name.StartsWith("__MACOSX/", StringComparison.Ordinal)
           || Path.GetFileName(name) is ".DS_Store" or "Thumbs.db";

    // Unix mode in the high half of the external attributes: S_IFLNK.
    private static bool IsSymlink(ZipArchiveEntry entry) => ((entry.ExternalAttributes >> 16) & 0xF000) == 0xA000;

    private static string Shorten(string s) => s.Length > 80 ? s[..80] + "…" : s;

    // The most common reason a build shows a blank screen: assets referenced by absolute
    // path, which point outside /g/{game}/r{n}/ (docs/web-build).
    private static readonly Regex AbsoluteAsset = new(
        """(?:src|href)\s*=\s*["']/(?!/)""", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static IReadOnlyList<string> Warn(string entryFile)
    {
        var warnings = new List<string>();
        try
        {
            var html = File.ReadAllText(entryFile);
            if (AbsoluteAsset.IsMatch(html.Replace("/jam-sdk.js", string.Empty)))
                warnings.Add("The HTML entry references assets by absolute path (src=\"/…\"); the build is served " +
                             "from its own folder, so use relative paths or the game may show a blank screen");
        }
        catch (IOException) { }
        return warnings;
    }
}

/// <summary>
/// Puts the jam bridge into a build's HTML entry as it is served: one
/// <c>&lt;script src="/jam-sdk.js" data-jam-portal-origins="…"&gt;</c> tag before the first
/// <c>&lt;script&gt;</c> (so <c>window.Jam</c> exists before any game code runs; not right
/// after <c>&lt;head&gt;</c>, which would push <c>&lt;meta charset&gt;</c> out of the
/// document's first bytes), else before <c>&lt;/head&gt;</c> / <c>&lt;/body&gt;</c>, else at
/// the top. Done at serve time rather than at upload, so the origins always match the
/// current configuration. A build carrying its own <c>jam-sdk.js</c> tag has it replaced:
/// without the origins list that copy could not talk to TOX from another origin.
/// </summary>
public static class JamSdkInjector
{
    private static readonly Regex ExistingTag = new(
        """<script\b[^>]*\bsrc\s*=\s*["'][^"']*jam-sdk\.js[^"']*["'][^>]*>\s*</script>\s*""",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static string Tag(IEnumerable<string> portalOrigins)
        => $"<script src=\"/jam-sdk.js\" data-jam-portal-origins=\"{System.Net.WebUtility.HtmlEncode(string.Join(',', portalOrigins))}\"></script>\n";

    public static string Inject(string html, IEnumerable<string> portalOrigins)
    {
        html = ExistingTag.Replace(html, string.Empty);
        var tag = Tag(portalOrigins);
        foreach (var pattern in new[] { "<script\\b", "</head>", "</body>" })
        {
            var m = Regex.Match(html, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (m.Success)
                return html[..m.Index] + tag + html[m.Index..];
        }
        return tag + html;
    }

    /// <summary>
    /// The entry file with the tag, or null when it is not valid UTF-8 — such a file is
    /// served as uploaded (a mangled entry would break the build; the bridge is optional).
    /// </summary>
    public static byte[]? InjectFile(byte[] bytes, IEnumerable<string> portalOrigins)
    {
        string html;
        try { html = new UTF8Encoding(false, throwOnInvalidBytes: true).GetString(bytes); }
        catch (DecoderFallbackException) { return null; }
        var bom = html.Length > 0 && html[0] == '\uFEFF';
        var injected = Inject(bom ? html[1..] : html, portalOrigins);
        return Encoding.UTF8.GetBytes(bom ? '\uFEFF' + injected : injected);
    }
}

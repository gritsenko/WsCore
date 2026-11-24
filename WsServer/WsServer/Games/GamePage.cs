using System.Net;
using System.Text.RegularExpressions;

namespace WsServer.Games;

/// <summary>
/// The client's <c>index.html</c> with a game's link-preview tags — the jam's share page
/// (<c>s3_share._head_meta</c>): absolute URLs (Telegram resolves nothing relative),
/// <c>og:image</c> with its size (an unfurler left to guess draws a thumbnail), and
/// <c>summary_large_image</c> only with a picture (a large card without one is a grey hole).
/// </summary>
public static class GamePage
{
    public static string Render(string html, GameCatalog catalog, GameView view)
    {
        var game = view.Game;
        var title = $"{game.Title} — игра в TOX";
        var description = game.Tagline.Length > 0 ? game.Tagline : FirstLine(game.Description);
        var url = catalog.PageUrl(game);

        html = Regex.Replace(html, "<title>[^<]*</title>", $"<title>{Enc(title)}</title>", RegexOptions.IgnoreCase);
        html = Set(html, "name", "description", description);
        html = Regex.Replace(html, """<link\s+rel="canonical"\s+href="[^"]*"\s*/?>""", $"<link rel=\"canonical\" href=\"{Enc(url)}\" />");
        html = Set(html, "property", "og:title", game.Title);
        html = Set(html, "property", "og:description", description);
        html = Set(html, "property", "og:url", url);
        html = Set(html, "name", "twitter:title", game.Title);
        html = Set(html, "name", "twitter:description", description);

        if (view.Cover is { } cover)
        {
            var image = catalog.PublicUrl(GameCatalog.MediaPath(cover));
            html = Set(html, "property", "og:image", image);
            html = Set(html, "property", "og:image:alt", game.Title);
            html = Set(html, "name", "twitter:image", image);
            html = Set(html, "name", "twitter:card", "summary_large_image");
            html = cover is { Width: > 0, Height: > 0 }
                ? Set(Set(html, "property", "og:image:width", cover.Width.ToString()), "property", "og:image:height", cover.Height.ToString())
                : Remove(Remove(html, "property", "og:image:width"), "property", "og:image:height");
        }
        return html;
    }

    private static string FirstLine(string text)
    {
        var line = text.Split('\n').Select(l => l.Trim().TrimStart('#', '-', '*', ' ')).FirstOrDefault(l => l.Length > 0) ?? string.Empty;
        return line.Length > 200 ? line[..200] + "…" : line;
    }

    private static string Enc(string value) => WebUtility.HtmlEncode(value);

    // Sets the content of <meta {attr}="{key}" content="…">, or adds it before </head>.
    private static string Set(string html, string attr, string key, string value)
    {
        var tag = $"<meta {attr}=\"{key}\" content=\"{Enc(value)}\" />";
        var pattern = new Regex($"""<meta\s+{attr}="{Regex.Escape(key)}"\s+content="[^"]*"\s*/?>""", RegexOptions.IgnoreCase);
        if (pattern.IsMatch(html))
            return pattern.Replace(html, tag.Replace("$", "$$"), 1);
        var head = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        return head < 0 ? html : html[..head] + "    " + tag + "\n" + html[head..];
    }

    private static string Remove(string html, string attr, string key)
        => Regex.Replace(html, $"""\s*<meta\s+{attr}="{Regex.Escape(key)}"\s+content="[^"]*"\s*/?>""", string.Empty, RegexOptions.IgnoreCase);
}

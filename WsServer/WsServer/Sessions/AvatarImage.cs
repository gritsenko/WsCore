using WsServer.Persistence;

namespace WsServer.Sessions;

/// <summary>Avatar files: what is accepted on upload, and the HTTP endpoint serving them.</summary>
public static class AvatarImage
{
    // Bounds how many avatar reads can sit in the storage queue at once: the endpoint is
    // unauthenticated and must not be able to crowd out chat writes.
    private static readonly SemaphoreSlim Loads = new(8);

    /// <summary>
    /// The MIME type of a PNG / JPEG / WebP file judged by its signature, or null for
    /// anything else. The type is never taken from the client, and the file is served
    /// with <c>nosniff</c>, so an upload can only ever be rendered as one of these.
    /// </summary>
    public static string? DetectContentType(ReadOnlySpan<byte> data)
    {
        if (data.StartsWith<byte>([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
            return "image/png";
        if (data.StartsWith<byte>([0xFF, 0xD8, 0xFF]))
            return "image/jpeg";
        if (data.Length >= 12 && data[..4].SequenceEqual("RIFF"u8) && data.Slice(8, 4).SequenceEqual("WEBP"u8))
            return "image/webp";
        return null;
    }

    /// <summary>
    /// Maps GET /avatars/{userId}. Clients request it as <c>?v={AvatarVersion}</c> (from
    /// presence) — a URL whose content never changes, so it is cached forever; without a
    /// version the response is revalidated.
    /// </summary>
    public static IEndpointConventionBuilder MapAvatars(this IEndpointRouteBuilder endpoints, string pattern = "/avatars/{userId}")
        => endpoints.MapGet(pattern, async (uint userId, HttpContext http, IChatStorage storage) =>
        {
            StoredAvatar? avatar;
            await Loads.WaitAsync(http.RequestAborted);
            try
            {
                var loaded = new TaskCompletionSource<StoredAvatar?>(TaskCreationOptions.RunContinuationsAsynchronously);
                storage.LoadAvatar(userId, a => loaded.TrySetResult(a));
                avatar = await loaded.Task;
            }
            finally
            {
                Loads.Release();
            }

            if (avatar == null)
                return Results.NotFound();

            http.Response.Headers.CacheControl = http.Request.Query.ContainsKey("v")
                ? "public, max-age=31536000, immutable"
                : "no-cache";
            http.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.Bytes(avatar.Data, avatar.ContentType);
        });
}

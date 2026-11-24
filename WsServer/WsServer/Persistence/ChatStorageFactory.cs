namespace WsServer.Persistence;

public static class ChatStorageFactory
{
    /// <summary>
    /// SQLite storage at <c>ChatDatabasePath</c>, or the in-memory fallback when no path
    /// is configured. A database that cannot be opened (read-only volume, corrupt file)
    /// must not take the game server down with it: that is logged as an error and the
    /// server runs without persistence.
    /// </summary>
    public static IChatStorage Create(GameServerOptions options, ILogger logger)
    {
        if (string.IsNullOrWhiteSpace(options.ChatDatabasePath))
            return new NullChatStorage();

        try
        {
            return new SqliteChatStorage(
                options.ChatDatabasePath, options.ChatHistoryMaxMessagesPerRoom, options.UserRetentionDays, logger,
                options.GameAnalyticsRetentionDays);
        }
        catch (Exception e)
        {
            logger.LogError(e,
                "Cannot open the chat database at {Path} — running WITHOUT chat persistence",
                Path.GetFullPath(options.ChatDatabasePath));
            return new NullChatStorage();
        }
    }
}

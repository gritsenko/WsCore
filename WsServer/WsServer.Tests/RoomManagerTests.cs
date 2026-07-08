using WsServer.Rooms;

namespace WsServer.Tests;

public class RoomManagerTests
{
    private static RoomManager NewManager() => new();

    [Fact]
    public void JoinRoom_SpatialCapableRoom_DefaultsClientToSpatialMode()
    {
        using var manager = NewManager();
        manager.CreateRoom("game", "Game", [RoomCompatibility.Spatial, RoomCompatibility.TextChat]);

        Assert.True(manager.JoinRoom(1, "Alice", "game"));
        Assert.True(manager.ShouldReceiveSpatialUpdates(1));
    }

    [Fact]
    public void JoinRoom_TextChatOnlyRoom_DoesNotReceiveSpatialUpdates()
    {
        using var manager = NewManager();
        manager.CreateRoom("lobby", "Lobby", [RoomCompatibility.TextChat]);

        Assert.True(manager.JoinRoom(1, "Alice", "lobby"));
        Assert.False(manager.ShouldReceiveSpatialUpdates(1));
    }

    [Fact]
    public void JoinRoom_UnknownRoom_ReturnsFalse()
    {
        using var manager = NewManager();
        Assert.False(manager.JoinRoom(1, "Alice", "does-not-exist"));
    }

    [Fact]
    public void JoinRoom_SwitchingRooms_LeavesThePreviousRoom()
    {
        using var manager = NewManager();
        manager.CreateRoom("lobby", "Lobby", [RoomCompatibility.TextChat], isPersistent: true);
        manager.CreateRoom("game", "Game", [RoomCompatibility.Spatial, RoomCompatibility.TextChat]);

        manager.JoinRoom(1, "Alice", "lobby");
        manager.JoinRoom(1, "Alice", "game");

        Assert.Equal("game", manager.GetClientRoom(1)!.Id);
        Assert.DoesNotContain(1u, manager.GetRoom("lobby")!.GetClientIds());
    }

    [Fact]
    public void LeaveRoom_NonPersistentRoom_IsRemovedOnceEmpty()
    {
        using var manager = NewManager();
        manager.CreateRoom("game", "Game", [RoomCompatibility.Spatial], isPersistent: false);
        manager.JoinRoom(1, "Alice", "game");

        manager.LeaveRoom(1);

        Assert.Null(manager.GetRoom("game"));
    }

    [Fact]
    public void LeaveRoom_PersistentRoom_SurvivesBeingEmptied()
    {
        using var manager = NewManager();
        manager.CreateRoom("lobby", "Lobby", [RoomCompatibility.TextChat], isPersistent: true);
        manager.JoinRoom(1, "Alice", "lobby");

        manager.LeaveRoom(1);

        Assert.NotNull(manager.GetRoom("lobby"));
    }

    [Fact]
    public void ShouldReceiveSpatialUpdates_ClientNotInAnyRoom_ReturnsFalse()
    {
        using var manager = NewManager();
        Assert.False(manager.ShouldReceiveSpatialUpdates(42));
    }
}

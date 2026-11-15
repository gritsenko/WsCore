using Game.ServerLogic.Account.Events;
using Game.ServerLogic.Account.Requests;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Player.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.Rooms.Events;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Tests;

/// <summary>
/// Accounts: a guest (a key in one browser) claims its user with a login + password and
/// can then enter it from another device; plus the profile (about, avatar).
/// </summary>
public class AccountTests
{
    private const string AnnKey = "ann-key-0123456789abcdef";
    private const string AnnPhoneKey = "ann-phone-0123456789abcdef";
    private const string BobKey = "bob-key-0123456789abcdef";
    private const string Password = "correct horse";

    // The smallest things that pass for image files.
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 4, 5];

    private static async Task<(RecordingConnection Conn, PresenceSnapshotEvent Snapshot)> Join(
        ServerHarness h, string key, string name)
    {
        var conn = await h.Connect();
        await h.Request(conn, new IdentifyRequest { UserKey = key, Name = name });
        return (conn, h.Events<PresenceSnapshotEvent>(conn).Single());
    }

    /// <summary>Sends an account request and waits for its (possibly asynchronous) answer.</summary>
    private static async Task<AccountResultEvent> Do(ServerHarness h, RecordingConnection conn, WsServer.Abstract.Messages.IClientRequest request)
    {
        var before = h.Events<AccountResultEvent>(conn).Length;
        await h.Request(conn, request);
        await TestSupport.WaitUntil(() => h.Events<AccountResultEvent>(conn).Length > before);
        return h.Events<AccountResultEvent>(conn).Last();
    }

    private static Task<AccountResultEvent> Claim(ServerHarness h, RecordingConnection conn, string login, string password = Password)
        => Do(h, conn, new ClaimAccountRequest { Login = login, Password = password });

    private static PresenceUserInfo LastUpdate(ServerHarness h, RecordingConnection conn, uint userId)
        => h.Events<PresenceUpdateEvent>(conn).Last(e => e.User.UserId == userId).User;

    [Fact]
    public async Task AGuest_ClaimsItsUser_AndKeepsItsIdentity()
    {
        await using var h = new ServerHarness();
        var (ann, snapshot) = await Join(h, AnnKey, "Ann");
        Assert.Null(snapshot.YourLogin);

        var result = await Claim(h, ann, "Ann.Smith");

        Assert.True(result.Success);
        Assert.Equal(AccountAction.Claim, result.Action);
        Assert.Equal("ann.smith", result.Login); // logins are case-insensitive
        var user = h.Sessions.Get(ann.Id)!.User!;
        Assert.Equal(snapshot.YourUserId, user.Id);
        Assert.NotEqual(Password, user.PasswordHash);
        Assert.True(PasswordHasher.Verify(Password, user.PasswordHash!));

        // The same browser keeps identifying with its key — now told it is an account.
        await h.Disconnect(ann);
        var (_, again) = await Join(h, AnnKey, "Ann");
        Assert.Equal((snapshot.YourUserId, "ann.smith"), (again.YourUserId, again.YourLogin));
    }

    [Theory]
    [InlineData("ab", Password, AccountError.InvalidLogin)]
    [InlineData("has space", Password, AccountError.InvalidLogin)]
    [InlineData("логин", Password, AccountError.InvalidLogin)]
    [InlineData("ann", "short", AccountError.InvalidPassword)]
    public async Task Claim_RefusesBadLoginsAndPasswords(string login, string password, string error)
    {
        await using var h = new ServerHarness();
        var (ann, _) = await Join(h, AnnKey, "Ann");

        var result = await Claim(h, ann, login, password);

        Assert.False(result.Success);
        Assert.Equal(error, result.Error);
        Assert.False(h.Sessions.Get(ann.Id)!.User!.IsClaimed);
    }

    [Fact]
    public async Task Claim_NeedsAnIdentifiedConnection_AFreeLogin_AndAnUnclaimedUser()
    {
        await using var h = new ServerHarness();
        var anonymous = await h.Connect();
        Assert.Equal(AccountError.NotIdentified, (await Claim(h, anonymous, "ann")).Error);

        var (ann, _) = await Join(h, AnnKey, "Ann");
        var (bob, _) = await Join(h, BobKey, "Bob");
        Assert.True((await Claim(h, ann, "ann")).Success);

        Assert.Equal(AccountError.LoginTaken, (await Claim(h, bob, "ANN")).Error);
        Assert.Equal(AccountError.AlreadyClaimed, (await Claim(h, ann, "ann2")).Error);
    }

    [Fact]
    public async Task Login_FromAnotherDevice_EntersTheSameUser_WithItsName_AndTheKeyWorksAfterwards()
    {
        await using var h = new ServerHarness();
        var (ann, annSnapshot) = await Join(h, AnnKey, "Ann");
        await Claim(h, ann, "ann");
        var (bob, _) = await Join(h, BobKey, "Bob");

        // A new device: no identify, just the login with a key it made up.
        var phone = await h.Connect();
        var result = await Do(h, phone, new LoginRequest { Login = "Ann", Password = Password, UserKey = AnnPhoneKey });

        Assert.True(result.Success);
        Assert.Equal("ann", result.Login);
        var snapshot = await h.WaitFor<PresenceSnapshotEvent>(phone);
        Assert.Equal((annSnapshot.YourUserId, "ann"), (snapshot.YourUserId, snapshot.YourLogin));
        Assert.Equal("Ann", h.Sessions.Get(phone.Id)!.Name);
        Assert.Equal(2, h.Sessions.Get(ann.Id)!.User!.Sessions.Count);

        // Chat from the phone is Ann's.
        await h.Request(phone, new ChatMessageRequest { Message = "hi" });
        var message = h.Events<ChatMessageEvent>(bob).Last();
        Assert.Equal((annSnapshot.YourUserId, "Ann"), (message.UserId, message.Name));

        // Later connects of the phone just identify with its key (no name needed).
        await h.Disconnect(phone);
        var back = await h.Connect();
        await h.Request(back, new IdentifyRequest { UserKey = AnnPhoneKey, Name = "" });
        Assert.Equal(annSnapshot.YourUserId, h.Events<PresenceSnapshotEvent>(back).Single().YourUserId);
        Assert.Equal("Ann", h.Sessions.Get(back.Id)!.Name);
    }

    [Fact]
    public async Task Login_AsAGuest_LeavesTheGuestUser_WhoGoesOffline()
    {
        await using var h = new ServerHarness();
        var (ann, annSnapshot) = await Join(h, AnnKey, "Ann");
        await Claim(h, ann, "ann");
        var (guest, guestSnapshot) = await Join(h, BobKey, "Visitor");

        var result = await Do(h, guest, new LoginRequest { Login = "ann", Password = Password, UserKey = AnnPhoneKey });

        Assert.True(result.Success);
        Assert.Equal(annSnapshot.YourUserId, h.Sessions.Get(guest.Id)!.User!.Id);
        Assert.Equal(PresenceStatus.Offline, LastUpdate(h, ann, guestSnapshot.YourUserId).Status);
        // The room's user list shows the connection under its new user and name.
        var listed = h.Events<RoomUsersUpdateEvent>(ann).Last().Users.Single(u => u.ClientId == guest.Id);
        Assert.Equal((annSnapshot.YourUserId, "Ann"), (listed.UserId, listed.Name));
    }

    [Fact]
    public async Task Login_WithAWrongPassword_OrAnUnknownLogin_IsRefused_TheSameWay()
    {
        await using var h = new ServerHarness();
        var (ann, _) = await Join(h, AnnKey, "Ann");
        await Claim(h, ann, "ann");
        var phone = await h.Connect();

        var wrong = await Do(h, phone, new LoginRequest { Login = "ann", Password = "wrong password", UserKey = AnnPhoneKey });
        var unknown = await Do(h, phone, new LoginRequest { Login = "nobody", Password = Password, UserKey = AnnPhoneKey });
        var badKey = await Do(h, phone, new LoginRequest { Login = "ann", Password = Password, UserKey = "short" });

        Assert.Equal((false, AccountError.BadCredentials), (wrong.Success, wrong.Error));
        Assert.Equal((false, AccountError.BadCredentials), (unknown.Success, unknown.Error));
        Assert.Equal(AccountError.InvalidKey, badKey.Error);
        Assert.Null(h.Sessions.Get(phone.Id)!.User);
        Assert.Empty(h.Events<PresenceSnapshotEvent>(phone));

        // The key of a failed login identifies nobody in particular: a new guest.
        await h.Request(phone, new IdentifyRequest { UserKey = AnnPhoneKey, Name = "Phone" });
        Assert.NotEqual(h.Sessions.Get(ann.Id)!.User!.Id, h.Sessions.Get(phone.Id)!.User!.Id);
    }

    [Fact]
    public async Task RepeatedWrongPasswords_LockTheLogin_EvenForTheRightOne()
    {
        await using var h = new ServerHarness(o => o.LoginMaxFailures = 3);
        var (ann, _) = await Join(h, AnnKey, "Ann");
        await Claim(h, ann, "ann");

        for (var i = 0; i < 3; i++)
        {
            var attacker = await h.Connect(); // a new connection each time: the lock is per login
            var result = await Do(h, attacker, new LoginRequest { Login = "ann", Password = $"guess-{i}-xxxx", UserKey = AnnPhoneKey });
            Assert.Equal(AccountError.BadCredentials, result.Error);
        }

        var phone = await h.Connect();
        var locked = await Do(h, phone, new LoginRequest { Login = "ann", Password = Password, UserKey = AnnPhoneKey });
        Assert.Equal(AccountError.TooManyAttempts, locked.Error);

        // Devices that are already logged in are unaffected.
        await h.Disconnect(ann);
        var (_, snapshot) = await Join(h, AnnKey, "Ann");
        Assert.Equal("ann", snapshot.YourLogin);
    }

    [Fact]
    public async Task AccountRequests_AreRateLimitedPerConnection()
    {
        await using var h = new ServerHarness(o => o.AccountRequestCooldownSeconds = 30);
        var (ann, _) = await Join(h, AnnKey, "Ann");

        Assert.True((await Do(h, ann, new UpdateProfileRequest { About = "one" })).Success);
        var second = await Do(h, ann, new UpdateProfileRequest { About = "two" });

        Assert.Equal(AccountError.TooFast, second.Error);
        Assert.Equal("one", h.Sessions.Get(ann.Id)!.User!.About);
    }

    [Fact]
    public async Task Logout_DropsThisDevicesKey_ButNotTheOthers()
    {
        await using var h = new ServerHarness();
        var (ann, annSnapshot) = await Join(h, AnnKey, "Ann");
        await Claim(h, ann, "ann");
        var annId = annSnapshot.YourUserId;
        var phone = await h.Connect();
        await Do(h, phone, new LoginRequest { Login = "ann", Password = Password, UserKey = AnnPhoneKey });
        var (bob, _) = await Join(h, BobKey, "Bob");

        var result = await Do(h, phone, new LogoutRequest());

        Assert.True(result.Success);
        Assert.Null(result.Login);
        Assert.Null(h.Sessions.Get(phone.Id)!.User);
        Assert.Equal(0u, h.Events<RoomUsersUpdateEvent>(bob).Last().Users.Single(u => u.ClientId == phone.Id).UserId);
        // Ann is still online on her first device…
        Assert.Equal(PresenceStatus.Online, h.Sessions.Get(ann.Id)!.User!.Status);

        // …and the phone's key is now just a key: it makes a new guest.
        await h.Disconnect(phone);
        var (_, stranger) = await Join(h, AnnPhoneKey, "Phone");
        Assert.NotEqual(annId, stranger.YourUserId);
        Assert.Null(stranger.YourLogin);

        // The first device's key still is Ann.
        await h.Disconnect(ann);
        var (_, back) = await Join(h, AnnKey, "Ann");
        Assert.Equal(annId, back.YourUserId);
    }

    [Fact]
    public async Task AGuest_CannotLogOut()
    {
        await using var h = new ServerHarness();
        var (ann, _) = await Join(h, AnnKey, "Ann");

        var result = await Do(h, ann, new LogoutRequest());

        Assert.Equal(AccountError.NotClaimed, result.Error);
        Assert.NotNull(h.Sessions.Get(ann.Id)!.User); // its key is the only way back to it
    }

    [Fact]
    public async Task About_IsCleaned_Capped_AndAnnouncedToEveryone()
    {
        await using var h = new ServerHarness(o => o.MaxAboutLength = 10);
        var (ann, annSnapshot) = await Join(h, AnnKey, "Ann");
        var (bob, _) = await Join(h, BobKey, "Bob");

        var result = await Do(h, ann, new UpdateProfileRequest { About = "line\none two three " });

        Assert.True(result.Success);
        Assert.Equal("lineone tw", LastUpdate(h, bob, annSnapshot.YourUserId).About);
        Assert.Equal("lineone tw", LastUpdate(h, ann, annSnapshot.YourUserId).About);

        // Newcomers get it with the member list.
        var late = await h.Connect();
        await h.Request(late, new IdentifyRequest { UserKey = AnnPhoneKey, Name = "Late" });
        var listed = h.Events<PresenceSnapshotEvent>(late).Single().Users.Single(u => u.UserId == annSnapshot.YourUserId);
        Assert.Equal("lineone tw", listed.About);
    }

    [Fact]
    public async Task Avatar_IsStored_Versioned_AndAnnounced_AndCanBeRemoved()
    {
        await using var h = new ServerHarness();
        var (ann, annSnapshot) = await Join(h, AnnKey, "Ann");
        var (bob, _) = await Join(h, BobKey, "Bob");
        var annId = annSnapshot.YourUserId;

        Assert.True((await Do(h, ann, new SetAvatarRequest { Image = Png })).Success);
        var first = LastUpdate(h, bob, annId).AvatarVersion;
        Assert.NotEqual(0u, first);
        var stored = await LoadAvatar(h.Storage, annId);
        Assert.Equal(("image/png", Png), (stored!.ContentType, stored.Data));

        // A new image is a new version (the URL is cached forever by clients).
        Assert.True((await Do(h, ann, new SetAvatarRequest { Image = Jpeg })).Success);
        var second = LastUpdate(h, bob, annId).AvatarVersion;
        Assert.True(second > first);
        Assert.Equal("image/jpeg", (await LoadAvatar(h.Storage, annId))!.ContentType);

        Assert.True((await Do(h, ann, new SetAvatarRequest { Image = [] })).Success);
        Assert.Equal(0u, LastUpdate(h, bob, annId).AvatarVersion);
        Assert.Null(await LoadAvatar(h.Storage, annId));
    }

    [Fact]
    public async Task Avatar_MustBeASmallImageFile()
    {
        await using var h = new ServerHarness(o => o.MaxAvatarBytes = 64);
        var (ann, _) = await Join(h, AnnKey, "Ann");

        var notAnImage = await Do(h, ann, new SetAvatarRequest { Image = "<svg onload=alert(1)>"u8.ToArray() });
        var tooBig = await Do(h, ann, new SetAvatarRequest { Image = [.. Png, .. new byte[64]] });

        Assert.Equal(AccountError.InvalidImage, notAnImage.Error);
        Assert.Equal(AccountError.InvalidImage, tooBig.Error);
        Assert.Equal(0u, h.Sessions.Get(ann.Id)!.User!.AvatarVersion);
        Assert.Empty(h.Events<PresenceUpdateEvent>(ann));
    }

    [Theory]
    [InlineData(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, "image/png")]
    [InlineData(new byte[] { 0xFF, 0xD8, 0xFF, 0xDB }, "image/jpeg")]
    [InlineData(new byte[] { 0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50 }, "image/webp")]
    [InlineData(new byte[] { 0x47, 0x49, 0x46, 0x38 }, null)] // gif
    [InlineData(new byte[] { 0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45 }, null)] // wav
    [InlineData(new byte[0], null)]
    public void AvatarFiles_AreRecognisedBySignature(byte[] data, string? expected)
        => Assert.Equal(expected, AvatarImage.DetectContentType(data));

    [Fact]
    public async Task TheAccount_ItsDevices_AndItsProfile_SurviveARestart()
    {
        using var db = new TempDatabase();
        uint annId;
        await using (var first = new ServerHarness(o => o.ChatDatabasePath = db.Path))
        {
            var (ann, snapshot) = await Join(first, AnnKey, "Ann");
            annId = snapshot.YourUserId;
            await Claim(first, ann, "ann");
            await Do(first, ann, new UpdateProfileRequest { About = "hello" });
            await Do(first, ann, new SetAvatarRequest { Image = Png });
            var phone = await first.Connect();
            await Do(first, phone, new LoginRequest { Login = "ann", Password = Password, UserKey = AnnPhoneKey });
        }

        await using var second = new ServerHarness(o => o.ChatDatabasePath = db.Path);

        // Both devices are still Ann; so is the password.
        var (_, fromPhone) = await Join(second, AnnPhoneKey, "");
        Assert.Equal((annId, "ann"), (fromPhone.YourUserId, fromPhone.YourLogin));
        var me = fromPhone.Users.Single(u => u.UserId == annId);
        Assert.Equal(("Ann", "hello"), (me.Name, me.About));
        Assert.NotEqual(0u, me.AvatarVersion);
        Assert.Equal(Png, (await LoadAvatar(second.Storage, annId))!.Data);

        var tablet = await second.Connect();
        var login = await Do(second, tablet, new LoginRequest { Login = "ann", Password = Password, UserKey = BobKey });
        Assert.True(login.Success);
        Assert.Equal(annId, second.Sessions.Get(tablet.Id)!.User!.Id);
    }

    [Fact]
    public async Task ARename_OnOneDevice_IsTheAccountsName_OnTheOthers()
    {
        await using var h = new ServerHarness();
        var (ann, _) = await Join(h, AnnKey, "Ann");
        await Claim(h, ann, "ann");
        await h.Request(ann, new SetPlayerNameRequest { Name = "Annie" });

        var phone = await h.Connect();
        await Do(h, phone, new LoginRequest { Login = "ann", Password = Password, UserKey = AnnPhoneKey });

        Assert.Equal("Annie", h.Sessions.Get(phone.Id)!.Name);
    }

    [Fact]
    public async Task ARename_ReachesTheUsersOtherConnections_AtOnce()
    {
        await using var h = new ServerHarness();
        var (ann, _) = await Join(h, AnnKey, "Ann");
        await Claim(h, ann, "ann");
        var phone = await h.Connect();
        await Do(h, phone, new LoginRequest { Login = "ann", Password = Password, UserKey = AnnPhoneKey });

        await h.Request(phone, new SetPlayerNameRequest { Name = "Annie" });

        Assert.Equal("Annie", h.Sessions.Get(ann.Id)!.Name);
        Assert.Contains(h.Events<Game.ServerLogic.Player.Events.SetPlayerNameEvent>(ann),
            e => e.ClientId == ann.Id && e.Name == "Annie");
        // …so what the first device writes is signed with the new name.
        await h.Request(ann, new ChatMessageRequest { Message = "hi" });
        Assert.Equal("Annie", h.Events<ChatMessageEvent>(phone).Last().Name);
    }

    private static Task<StoredAvatar?> LoadAvatar(IChatStorage storage, uint userId)
    {
        var done = new TaskCompletionSource<StoredAvatar?>(TaskCreationOptions.RunContinuationsAsynchronously);
        storage.LoadAvatar(userId, done.SetResult);
        return done.Task;
    }
}

using System.Linq;
using GameModel.Common.Math;
using WsServer.ClientMessages;
using WsServer.Common;
using WsServer.ServerMessages;

namespace WsServer.ClientMessageHandlers
{
    public class DefaultClientMessageHandler : CommonMessageHandler
    {
        public void OnSetPlayerName(uint clientId, SetPlayerNameClientMessage clientClientMessage)
        {
            GameState.SetPlayerName(clientId, clientClientMessage.Name);
            Messenger.Broadcast(new SetPlayerNameServerMessage(clientId, clientClientMessage.Name));

            Logger.Log($"Player {clientId} set name: {clientClientMessage.Name}");
            GameServer.BroadCastTop();
        }

        public void OnSendChatMessage(uint clientId, ChatClientMessage clientClientMessage)
        {
            Messenger.Broadcast(new ChatServerMessage(clientId, clientClientMessage.Message));
            Logger.Log($"Player {clientId} wrote to chat: {clientClientMessage.Message}");
        }

        public void OnUpdatePlayerState(uint clientId, UpdatePlayerStateClientMessage msg)
        {
            var p = GameState.SetPlayerControls(clientId, new Vector2D(msg.AimX, msg.AimY), msg.ControlsState);
        }

        public void OnPlayerShooting(uint clientId, PlayerShootingClientMessage msg)
        {
            var player = GameState.GetPlayer(clientId);
            GameState.SpawnBullet(player.Movement.Pos, player.Movement.AimPos, clientId);
            Messenger.Broadcast(new PlayerShootingServerMessage(clientId, msg.Weapon));
        }

        public void OnPlayerTargetUpdate(uint clientId, UpdatePlayerTargetClientMessage msg)
        {
            var p = GameState.SetPlayerTarget(clientId, msg.AimX, msg.AimY);
        }

        public void OnPlayerSlotsUpdate(uint clientId, UpdatePlayerSlotsClientMessage msg)
        {
            var player = GameState.GetPlayer(clientId);

            player.BodyIndex = msg.Body;
            player.WeaponIndex = msg.Gun;
            player.ArmorIndex = msg.Armor;
            //GameState.SpawnBullet(player.Movement.Pos, player.Movement.AimPos);
            Messenger.Broadcast(new UpdatePlayerSlotsServerMessage(player));
        }

        public void OnPlayerHit(uint clientId, PlayerHitClientMessage msg)
        {
            var hitterPlayer = GameState.GetPlayer(msg.PlayeId);
            if (hitterPlayer != null && hitterPlayer.Hp > 0)
            {
                var targetPlayer = GameState.HitPlayer(msg.PlayeId, msg.HitPoints, clientId);

                Messenger.Broadcast(new SetPlayerHpServerMessage(targetPlayer));

                if (targetPlayer.Hp == 0)
                {
                    Logger.Log(GameState.Top);
                    GameServer.BroadCastTop();
                }
            }
        }

        public void OnPlayerRespawn(uint clientId, PlayerRespawnClientMessage msg)
        {
            var respawnPlayer = GameState.RespawnPlayer(msg.PlayerId);

            Messenger.Broadcast(new PlayerRespawnServerMessage(respawnPlayer));
        }

        public void OnSetMapObject(uint clientId, SetMapObjectClientMessage msg)
        {
            var player = GameState.GetPlayer(clientId);
            GameState.World.SetMapObject(msg.MapX, msg.MapY, msg.ObjectType);
            Messenger.Broadcast(
                new MapObjectsServerMessage(GameState.World.GetTileBlockObjects(0, 0).ToArray()));
        }

        public void OnDestroyMapObject(uint clientId, DestroyMapObjectClientMessage msg)
        {
            var player = GameState.GetPlayer(clientId);
            GameState.World.DestroyObjects(msg.MapX, msg.MapY);
            Messenger.Broadcast(
                new MapObjectsServerMessage(GameState.World.GetTileBlockObjects(0, 0).ToArray()));
        }

    }
}
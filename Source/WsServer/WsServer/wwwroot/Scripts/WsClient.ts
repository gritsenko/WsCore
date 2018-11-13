/// <reference path="WsConnection.ts" />
class WsClient extends Wsc{

    myPlayer: Player;
    myPlayerName = "John Smith";
    playersCount = 0;
    players: Player[] = [];

    onPlayerCreateCallback: Function;
    onGameInitCallback: Function;
    onMapObjectsCallback: Function;


    onInitPlayer(msg: InitPlayerServerMessage) {
        this.clientId = msg.clientid;
        this.sendSetPlayerName(this.myPlayerName);
        this.sendUpdatePlayerSlots(0, 0, 0);

        if (this.onGameInitCallback != undefined)
            this.onGameInitCallback();
    }

    onSetPlayerName(msg: SetPlayerNameServerMessage) {
        if (this.players[msg.clientid] != null) {
            this.players[msg.clientid].updateName(msg.name);
        }
    }

    onChatMessage(msg: ChatServerMessage) {
        this.writeToChat(msg.clientid, msg.message);
    }

    onPlayerJoined(msg: PlayerJoinedServerMessage) {
        this.updatePlayer(msg.playerstatedata);
    }

    onGameState(msg: GameStateServerMessage) {
        const playersCount = msg.playerstatedata.length;
        for (let i = 0; i < playersCount; i++) {
            this.updatePlayer(msg.playerstatedata[i]);
        }
    }

    onPlayersMovment(msg: PlayersMovementServerMessage) {
        const playersCount = msg.movmentstates.length;

        for (let i = 0; i < playersCount; i++) {
            const state = msg.movmentstates[i];

            const playerId = state.playerid;
            const p = this.players[playerId];

            if (p != undefined) {
                p.x = state.x;
                p.y = state.y;
                p.ax = state.aimx;
                p.ay = state.aimy;
                p.targetX = state.targetx;
                p.targetY = state.targety;
                p.angle = state.bodyangle;
                p.controls = state.controlsstate;
                p.speed.x = state.velocityx;
                p.speed.y = state.velocityy;
                p.animationState = state.animationstate;
                p.onStateUpdatedFromServer();
            }
        }
    }

    onMapObjects(msg: MapObjectsServerMessage): void {
        if (this.onMapObjectsCallback != undefined)
            this.onMapObjectsCallback(msg.mapobjects);

    }

    //onPlayerLeft(msg: PlayerLeftServerMessage) {
    //}

    //onRespawnPlayer(msg: PlayerRespawnServerMessage) {
    //}

    //onPlayerShooting(msg: PlayerShootingServerMessage) {
    //}

    //onPlayersTop(msg: PlayersTopServerMessage) {
    //}

    //onPlayerSetHp(msg: SetPlayerHpServerMessage) {
    //}

    //onUpdatePlayerSlots(msg: UpdatePlayerSlotsServerMessage) {
    //}

    writeToChat(id, message) {
        console.log(`Message to chat from client ${id}: ${message}`);
    }

    updatePlayer(playerData: PlayerStateData) {
        let player = null;
        let isNewPlayer = false;
        const playerId = playerData.id;

        if (playerId in this.players) {
            player = this.players[playerId];
        } else {
            player = new Player(playerId);
            this.players[playerId] = player;
            isNewPlayer = true;
            this.playersCount++;
        }

        this.setPlayerData(player, playerData);

        if ((this.myPlayer == null || this.myPlayer == undefined) && player.id === this.clientId) {
            this.myPlayer = player;
        }

        if (isNewPlayer && this.onPlayerCreateCallback != null) {
            this.onPlayerCreateCallback(player);
        }
    }

    setPlayerData(p:Player, pd: PlayerStateData) {
        p.name = pd.name.trim();
        p.hp = pd.hp;
        p.maxHp = pd.maxhp;
        p.body = pd.bodyindex;
        p.weapon = pd.weaponindex;
        p.armor = pd.armorindex;

        const ms = pd.movmentstate;
        p.x = ms.x;
        p.y = ms.y;
        p.ax = ms.aimx;
        p.ay = ms.aimy;
        p.angle = ms.bodyangle;
        p.controls = ms.controlsstate;
        p.speed.x = ms.velocityx;
        p.speed.y = ms.velocityy;
    }



}
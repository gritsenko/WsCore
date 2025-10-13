// Auto-generated message type IDs (should match server-side)
export enum ServerEventType {
    GameStateUpdateEvent = 0,
    GameTickUpdateEvent = 1,
    PlayerJoinedEvent = 2,
    PlayerLeftEvent = 3,
    PlayerRespawnEvent = 4,
    SetPlayerHpEvent = 5,
    PlayersTopEvent = 6,
    SetPlayerNameEvent = 100,
    UpdatePlayerSlotsEvent = 102,
    PlayerShootingEvent = 103,
    UpdateMapObjectsEvent = 52,
    InitPlayerEvent = 255,
    ChatMessageEvent = 200
}

export enum ClientMessageType {
    GetTilesRequest = 50,
    GetMapObjectsRequest = 51,
    SetMapObjectRequest = 52,
    DestroyMapObjectRequest = 53,
    SetPlayerNameRequest = 100,
    UpdatePlayerStateRequest = 101,
    UpdatePlayerSlotsRequest = 102,
    PlayerShootingRequest = 103,
    PlayerRespawnRequest = 105,
    UpdatePlayerTargetRequest = 106,
    ChatMessageRequest = 200
}

// Import all MemoryPack generated types
import { InitPlayerEvent } from "./protocol/InitPlayerEvent.js";
import { PlayerJoinedEvent } from "./protocol/PlayerJoinedEvent.js";
import { PlayerLeftEvent } from "./protocol/PlayerLeftEvent.js";
import { PlayerRespawnEvent } from "./protocol/PlayerRespawnEvent.js";
import { SetPlayerHpEvent } from "./protocol/SetPlayerHpEvent.js";
import { SetPlayerNameEvent } from "./protocol/SetPlayerNameEvent.js";
import { PlayerShootingEvent } from "./protocol/PlayerShootingEvent.js";
import { PlayersTopEvent } from "./protocol/PlayersTopEvent.js";
import { UpdatePlayerSlotsEvent } from "./protocol/UpdatePlayerSlotsEvent.js";
import { UpdateMapObjectsEvent } from "./protocol/UpdateMapObjectsEvent.js";
import { GameStateUpdateEvent } from "./protocol/GameStateUpdateEvent.js";
import { GameTickUpdateEvent } from "./protocol/GameTickUpdateEvent.js";
import { ChatMessageEvent } from "./protocol/ChatMessageEvent.js";

import { GetTilesRequest } from "./protocol/GetTilesRequest.js";
import { GetMapObjectsRequest } from "./protocol/GetMapObjectsRequest.js";
import { DestroyMapObjectRequest } from "./protocol/DestroyMapObjectRequest.js";
import { SetMapObjectRequest } from "./protocol/SetMapObjectRequest.js";
import { SetPlayerNameRequest } from "./protocol/SetPlayerNameRequest.js";
import { UpdatePlayerStateRequest } from "./protocol/UpdatePlayerStateRequest.js";
import { UpdatePlayerSlotsRequest } from "./protocol/UpdatePlayerSlotsRequest.js";
import { PlayerShootingRequest } from "./protocol/PlayerShootingRequest.js";
import { PlayerRespawnRequest } from "./protocol/PlayerRespawnRequest.js";
import { UpdatePlayerTargetRequest } from "./protocol/UpdatePlayerTargetRequest.js";
import { ChatMessageRequest } from "./protocol/ChatMessageRequest.js";

import { MemoryPackReader } from "./protocol/MemoryPackReader.js";
import { MemoryPackWriter } from "./protocol/MemoryPackWriter.js";

/**
 * WebSocket connection manager using MemoryPack serialization
 */
export default class WsConnection {
    clientId: number = -1;
    ws: WebSocket | null = null;
    overrideUrl: string | null = null;
    serverUrl: string = "";

    // Event handlers (override these in your game code)
    onInitPlayerEvent(msg: InitPlayerEvent): void {}
    onPlayerJoinedEvent(msg: PlayerJoinedEvent): void {}
    onPlayerLeftEvent(msg: PlayerLeftEvent): void {}
    onPlayerRespawnEvent(msg: PlayerRespawnEvent): void {}
    onPlayerShootingEvent(msg: PlayerShootingEvent): void {}
    onPlayersTopEvent(msg: PlayersTopEvent): void {}
    onSetPlayerHpEvent(msg: SetPlayerHpEvent): void {}
    onSetPlayerNameEvent(msg: SetPlayerNameEvent): void {}
    onUpdatePlayerSlotsEvent(msg: UpdatePlayerSlotsEvent): void {}
    onUpdateMapObjectsEvent(msg: UpdateMapObjectsEvent): void {}
    onGameStateUpdateEvent(msg: GameStateUpdateEvent): void {}
    onGameTickUpdateEvent(msg: GameTickUpdateEvent): void {}
    onChatMessageEvent(msg: ChatMessageEvent): void {}

    constructor() {}

    /**
     * Connect to the WebSocket server
     * @param overrideUrl Optional custom WebSocket URL
     */
    connect(overrideUrl?: string): void {
        this.overrideUrl = overrideUrl || null;
        this.ws = this.createSocket();
        this.ws.onmessage = (e) => this.processServerMessage(e.data);
        this.ws.onerror = (e) => console.error("WebSocket error:", e);
        this.ws.onclose = (e) => console.log("WebSocket closed:", e);
        this.ws.onopen = () => console.log("WebSocket connected");
    }

    /**
     * Create and configure WebSocket
     */
    private createSocket(): WebSocket {
        const scheme = document.location.protocol === "https:" ? "wss" : "ws";
        const port = document.location.port ? ":" + document.location.port : "";
        this.serverUrl = `${scheme}://${document.location.hostname}${port}/ws`;

        const url = this.overrideUrl || this.serverUrl;
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        return ws;
    }

    /**
     * Process incoming server message
     */
    private processServerMessage(data: ArrayBuffer): void {
        try {
            const reader = new MemoryPackReader(data);
            
            // Read message type ID (first byte)
            const messageType = reader.readUint8();

            // Deserialize and dispatch based on message type
            switch (messageType) {
                case ServerEventType.InitPlayerEvent:
                    this.onInitPlayerEvent(InitPlayerEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.PlayerJoinedEvent:
                    this.onPlayerJoinedEvent(PlayerJoinedEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.PlayerLeftEvent:
                    this.onPlayerLeftEvent(PlayerLeftEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.PlayerRespawnEvent:
                    this.onPlayerRespawnEvent(PlayerRespawnEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.PlayerShootingEvent:
                    this.onPlayerShootingEvent(PlayerShootingEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.PlayersTopEvent:
                    this.onPlayersTopEvent(PlayersTopEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.SetPlayerHpEvent:
                    this.onSetPlayerHpEvent(SetPlayerHpEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.SetPlayerNameEvent:
                    this.onSetPlayerNameEvent(SetPlayerNameEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.UpdatePlayerSlotsEvent:
                    this.onUpdatePlayerSlotsEvent(UpdatePlayerSlotsEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.UpdateMapObjectsEvent:
                    this.onUpdateMapObjectsEvent(UpdateMapObjectsEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.GameStateUpdateEvent:
                    this.onGameStateUpdateEvent(GameStateUpdateEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.GameTickUpdateEvent:
                    this.onGameTickUpdateEvent(GameTickUpdateEvent.deserializeCore(reader)!);
                    break;
                case ServerEventType.ChatMessageEvent:
                    this.onChatMessageEvent(ChatMessageEvent.deserializeCore(reader)!);
                    break;
                default:
                    console.warn(`Unknown server message type: ${messageType}`);
            }
        } catch (error) {
            console.error("Error processing server message:", error);
        }
    }

    /**
     * Send a message to the server
     */
    private sendMessage(messageType: ClientMessageType, data: Uint8Array): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error("WebSocket is not connected");
            return;
        }

        // Create buffer with message type prefix
        const buffer = new Uint8Array(1 + data.length);
        buffer[0] = messageType;
        buffer.set(data, 1);

        this.ws.send(buffer);
    }

    // ==================== Client Request Methods ====================

    sendPlayerRespawnRequest(): void {
        const request = new PlayerRespawnRequest();
        const data = PlayerRespawnRequest.serialize(request);
        this.sendMessage(ClientMessageType.PlayerRespawnRequest, data);
    }

    sendPlayerShootingRequest(weapon: number): void {
        const request = new PlayerShootingRequest();
        request.weapon = weapon;
        const data = PlayerShootingRequest.serialize(request);
        this.sendMessage(ClientMessageType.PlayerShootingRequest, data);
    }

    sendSetPlayerNameRequest(name: string): void {
        const request = new SetPlayerNameRequest();
        request.name = name;
        const data = SetPlayerNameRequest.serialize(request);
        this.sendMessage(ClientMessageType.SetPlayerNameRequest, data);
    }

    sendUpdatePlayerSlotsRequest(body: number, gun: number, armor: number): void {
        const request = new UpdatePlayerSlotsRequest();
        request.body = body;
        request.gun = gun;
        request.armor = armor;
        const data = UpdatePlayerSlotsRequest.serialize(request);
        this.sendMessage(ClientMessageType.UpdatePlayerSlotsRequest, data);
    }

    sendUpdatePlayerStateRequest(aimX: number, aimY: number, controlsState: number): void {
        const request = new UpdatePlayerStateRequest();
        request.aimX = aimX;
        request.aimY = aimY;
        request.controlsState = controlsState;
        const data = UpdatePlayerStateRequest.serialize(request);
        this.sendMessage(ClientMessageType.UpdatePlayerStateRequest, data);
    }

    sendUpdatePlayerTargetRequest(aimX: number, aimY: number): void {
        const request = new UpdatePlayerTargetRequest();
        request.aimX = aimX;
        request.aimY = aimY;
        const data = UpdatePlayerTargetRequest.serialize(request);
        this.sendMessage(ClientMessageType.UpdatePlayerTargetRequest, data);
    }

    sendDestroyMapObjectRequest(mapX: number, mapY: number): void {
        const request = new DestroyMapObjectRequest();
        request.mapX = mapX;
        request.mapY = mapY;
        const data = DestroyMapObjectRequest.serialize(request);
        this.sendMessage(ClientMessageType.DestroyMapObjectRequest, data);
    }

    sendGetMapObjectsRequest(mapX: number, mapY: number): void {
        const request = new GetMapObjectsRequest();
        request.mapX = mapX;
        request.mapY = mapY;
        const data = GetMapObjectsRequest.serialize(request);
        this.sendMessage(ClientMessageType.GetMapObjectsRequest, data);
    }

    sendGetTilesRequest(mapX: number, mapY: number): void {
        const request = new GetTilesRequest();
        request.mapX = mapX;
        request.mapY = mapY;
        const data = GetTilesRequest.serialize(request);
        this.sendMessage(ClientMessageType.GetTilesRequest, data);
    }

    sendSetMapObjectRequest(mapX: number, mapY: number, objectType: number): void {
        const request = new SetMapObjectRequest();
        request.mapX = mapX;
        request.mapY = mapY;
        request.objectType = objectType;
        const data = SetMapObjectRequest.serialize(request);
        this.sendMessage(ClientMessageType.SetMapObjectRequest, data);
    }

    sendChatMessageRequest(message: string): void {
        const request = new ChatMessageRequest();
        request.message = message;
        const data = ChatMessageRequest.serialize(request);
        this.sendMessage(ClientMessageType.ChatMessageRequest, data);
    }

    /**
     * Close the WebSocket connection
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

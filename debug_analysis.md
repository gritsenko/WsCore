# Debug Analysis: Game Movement Issue

## Root Cause Analysis

Looking at the console logs, the issue is clear:

1. **Mode Setting Works**: The joinRoom verification shows `clientMode=spatial_2d` correctly
2. **Mode Gets Reset**: But when the game tick is processed, it shows `clientMode=text_chat`
3. **Multiple Event Handlers**: Both LobbyApp and GameApp are processing the same WebSocket events

## The Issue

Both the lobby app and the game app are sharing the same `WsClient` instance. When switching from lobby to game:

1. LobbyApp sets mode to `TextChat` initially
2. GameApp joins 2d-game room and sets mode to `Spatial2D`
3. BUT lobby app event handlers are still active
4. When room updates come in, both apps process them, causing interference

## Solution

We need to modify the LobbyApp to clear its event handlers when switching to game mode, while keeping the WebSocket connection alive.

The fix involves:
1. Adding a method to clear lobby-specific event handlers in WsClient
2. Calling this method in LobbyApp.destroy(false)
3. Ensuring game app gets a clean client state
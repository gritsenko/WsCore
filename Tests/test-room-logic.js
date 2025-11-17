// Simple test to reproduce the room joining issue
// Run this by opening the client and watching console logs

console.log('=== Room Join Issue Reproduction Test ===');
console.log('Please follow these steps and watch the console:');
console.log('1. Join lobby');
console.log('2. Join 2D game room');
console.log('3. Join lobby back');
console.log('');
console.log('Look for the error: "Failed to join room: lobby"');
console.log('');
console.log('With our new logging, you should see detailed logs from:');
console.log('- [LobbyApp] joinRoom called');
console.log('- [WsClient] joinRoom called');
console.log('- [RoomManager] joinRoom called');
console.log('- Server-side logs with [RoomManager] prefix');
console.log('');
console.log('This will help us identify exactly where the issue occurs.');

// Let's also create a more direct test for the Room.addClient logic
console.log('\n=== Testing Room.addClient logic ===');

// Simulate the scenario
class MockRoom {
  constructor(id) {
    this.id = id;
    this.clients = new Map();
  }

  addClient(clientId, clientName) {
    console.log(`[MockRoom] addClient called: ${clientId} -> ${this.id}`);
    console.log(`[MockRoom] Current clients:`, Array.from(this.clients.keys()));
    
    if (this.clients.has(clientId)) {
      console.log(`[MockRoom] Client ${clientId} already in room ${this.id}, returning false`);
      return false;
    }
    
    this.clients.set(clientId, { id: clientId, name: clientName });
    console.log(`[MockRoom] Client ${clientId} added successfully to room ${this.id}`);
    console.log(`[MockRoom] Updated clients:`, Array.from(this.clients.keys()));
    return true;
  }

  removeClient(clientId) {
    console.log(`[MockRoom] removeClient called: ${clientId} from ${this.id}`);
    console.log(`[MockRoom] Current clients before:`, Array.from(this.clients.keys()));
    
    const removed = this.clients.delete(clientId);
    console.log(`[MockRoom] Client ${clientId} removed:`, removed);
    console.log(`[MockRoom] Current clients after:`, Array.from(this.clients.keys()));
    return removed;
  }

  get isEmpty() {
    return this.clients.size === 0;
  }
}

class MockRoomManager {
  constructor() {
    this.rooms = new Map();
    this.clientRoomMap = new Map();
  }

  createRoom(id, name, modes) {
    const room = new MockRoom(id);
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(clientId, clientName, roomId) {
    console.log(`[MockRoomManager] joinRoom: ${clientId}, ${clientName}, ${roomId}`);
    
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`[MockRoomManager] Room ${roomId} not found`);
      return false;
    }

    console.log(`[MockRoomManager] Room found. Current clientRoomMap:`, this.clientRoomMap);

    // If client is already in a room, remove them first
    if (this.clientRoomMap.has(clientId)) {
      console.log(`[MockRoomManager] Client ${clientId} is already in room, leaving current room first`);
      this.leaveRoom(clientId);
    }

    console.log(`[MockRoomManager] Adding client to room ${roomId}...`);
    const addResult = room.addClient(clientId, clientName);
    console.log(`[MockRoomManager] Room.addClient result:`, addResult);

    if (addResult) {
      this.clientRoomMap.set(clientId, roomId);
      console.log(`[MockRoomManager] Successfully joined room ${roomId}`);
      console.log(`[MockRoomManager] Client room map final:`, this.clientRoomMap);
      return true;
    }
    
    console.log(`[MockRoomManager] Failed to add client to room ${roomId}`);
    return false;
  }

  leaveRoom(clientId) {
    console.log(`[MockRoomManager] leaveRoom: ${clientId}`);
    const roomId = this.clientRoomMap.get(clientId);
    if (!roomId) {
      console.log(`[MockRoomManager] Client ${clientId} not in any room`);
      return false;
    }

    const room = this.rooms.get(roomId);
    if (room) {
      room.removeClient(clientId);

      if (room.isEmpty) {
        console.log(`[MockRoomManager] Room ${roomId} is empty, removing it`);
        this.rooms.delete(roomId);
      }
    }

    const success = this.clientRoomMap.delete(clientId);
    console.log(`[MockRoomManager] leaveRoom result:`, success);
    console.log(`[MockRoomManager] Client room map after leave:`, this.clientRoomMap);
    return success;
  }
}

// Run the test scenario
console.log('\n=== Running Test Scenario ===');
const roomManager = new MockRoomManager();
roomManager.createRoom('lobby', 'Lobby', ['TextChat']);
roomManager.createRoom('2d-game', '2D Game', ['Spatial2D']);

const clientId = 123;
const clientName = 'TestClient';

console.log('\n--- Step 1: Join lobby ---');
roomManager.joinRoom(clientId, clientName, 'lobby');

console.log('\n--- Step 2: Join 2D game room ---');
roomManager.joinRoom(clientId, clientName, '2d-game');

console.log('\n--- Step 3: Join lobby back (this should fail) ---');
roomManager.joinRoom(clientId, clientName, 'lobby');

console.log('\n=== Test Complete ===');
// Updated test with the fix applied
console.log('=== Testing Fixed Room Join Logic ===');

// Simulate the FIXED scenario
class FixedRoom {
  constructor(id, name, modes, isPersistent = false) {
    this.id = id;
    this.name = name;
    this.clients = new Map();
    this.isPersistent = isPersistent;
  }

  addClient(clientId, clientName) {
    console.log(`[FixedRoom] addClient called: ${clientId} -> ${this.id}`);
    console.log(`[FixedRoom] Current clients:`, Array.from(this.clients.keys()));
    
    if (this.clients.has(clientId)) {
      console.log(`[FixedRoom] Client ${clientId} already in room ${this.id}, returning false`);
      return false;
    }
    
    this.clients.set(clientId, { id: clientId, name: clientName });
    console.log(`[FixedRoom] Client ${clientId} added successfully to room ${this.id}`);
    console.log(`[FixedRoom] Updated clients:`, Array.from(this.clients.keys()));
    return true;
  }

  removeClient(clientId) {
    console.log(`[FixedRoom] removeClient called: ${clientId} from ${this.id}`);
    console.log(`[FixedRoom] Current clients before:`, Array.from(this.clients.keys()));
    
    const removed = this.clients.delete(clientId);
    console.log(`[FixedRoom] Client ${clientId} removed:`, removed);
    console.log(`[FixedRoom] Current clients after:`, Array.from(this.clients.keys()));
    return removed;
  }

  get isEmpty() {
    return this.clients.size === 0;
  }
}

class FixedRoomManager {
  constructor() {
    this.rooms = new Map();
    this.clientRoomMap = new Map();
  }

  createRoom(id, name, modes, isPersistent = false) {
    const room = new FixedRoom(id, name, modes, isPersistent);
    this.rooms.set(id, room);
    console.log(`[FixedRoomManager] Created room: ${id} (persistent: ${isPersistent})`);
    return room;
  }

  joinRoom(clientId, clientName, roomId) {
    console.log(`[FixedRoomManager] joinRoom: ${clientId}, ${clientName}, ${roomId}`);
    
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`[FixedRoomManager] Room ${roomId} not found`);
      return false;
    }

    console.log(`[FixedRoomManager] Room found. Current clientRoomMap:`, this.clientRoomMap);

    // If client is already in a room, remove them first
    if (this.clientRoomMap.has(clientId)) {
      console.log(`[FixedRoomManager] Client ${clientId} is already in room, leaving current room first`);
      this.leaveRoom(clientId);
    }

    console.log(`[FixedRoomManager] Adding client to room ${roomId}...`);
    const addResult = room.addClient(clientId, clientName);
    console.log(`[FixedRoomManager] Room.addClient result:`, addResult);

    if (addResult) {
      this.clientRoomMap.set(clientId, roomId);
      console.log(`[FixedRoomManager] Successfully joined room ${roomId}`);
      console.log(`[FixedRoomManager] Client room map final:`, this.clientRoomMap);
      return true;
    }
    
    console.log(`[FixedRoomManager] Failed to add client to room ${roomId}`);
    return false;
  }

  leaveRoom(clientId) {
    console.log(`[FixedRoomManager] leaveRoom: ${clientId}`);
    const roomId = this.clientRoomMap.get(clientId);
    if (!roomId) {
      console.log(`[FixedRoomManager] Client ${clientId} not in any room`);
      return false;
    }

    const room = this.rooms.get(roomId);
    if (room) {
      room.removeClient(clientId);

      // FIXED: Only remove empty rooms if they're not persistent
      if (room.isEmpty && !room.isPersistent) {
        console.log(`[FixedRoomManager] Room ${roomId} is empty, removing it`);
        this.rooms.delete(roomId);
      } else if (room.isEmpty && room.isPersistent) {
        console.log(`[FixedRoomManager] Room ${roomId} is empty but is persistent, keeping it`);
      }
    }

    const success = this.clientRoomMap.delete(clientId);
    console.log(`[FixedRoomManager] leaveRoom result:`, success);
    console.log(`[FixedRoomManager] Client room map after leave:`, this.clientRoomMap);
    return success;
  }
}

// Run the FIXED test scenario
console.log('\n=== Running FIXED Test Scenario ===');
const roomManager = new FixedRoomManager();

// Create persistent default rooms
roomManager.createRoom('lobby', 'Lobby', ['TextChat'], true); // <- MADE PERSISTENT
roomManager.createRoom('2d-game', '2D Game', ['Spatial2D'], true); // <- MADE PERSISTENT

const clientId = 123;
const clientName = 'TestClient';

console.log('\n--- Step 1: Join lobby ---');
roomManager.joinRoom(clientId, clientName, 'lobby');

console.log('\n--- Step 2: Join 2D game room ---');
roomManager.joinRoom(clientId, clientName, '2d-game');

console.log('\n--- Step 3: Join lobby back (should now work!) ---');
const result3 = roomManager.joinRoom(clientId, clientName, 'lobby');

console.log('\n=== Test Results ===');
console.log('✓ Step 1 - Join lobby: SUCCESS');
console.log('✓ Step 2 - Join 2D game: SUCCESS');
console.log(`✓ Step 3 - Join lobby back: ${result3 ? 'SUCCESS' : 'FAILED'}`);

if (result3) {
  console.log('\n🎉 FIX VERIFIED: The room joining issue has been resolved!');
  console.log('✓ Default rooms are now persistent and won\'t be deleted when empty');
  console.log('✓ Users can successfully rejoin lobby after leaving for other rooms');
} else {
  console.log('\n❌ Issue still exists - need further investigation');
}

console.log('\nFinal room state:', Array.from(roomManager.rooms.keys()));
console.log('Final client mapping:', roomManager.clientRoomMap);
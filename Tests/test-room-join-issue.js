/**
 * Test to reproduce the room joining issue
 * Steps: 1. join lobby 2. join another room 3. join lobby back - see the error
 */

// Mock WebSocket and DOM for testing
global.WebSocket = class {
  constructor(url) {
    this.url = url;
    this.readyState = 1; // OPEN
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    
    setTimeout(() => this.onopen && this.onopen(), 0);
  }
  
  send(data) {
    console.log('Mock WebSocket send:', data);
  }
  
  close() {
    this.onclose && this.onclose();
  }
};

// Mock document
global.document = {
  location: {
    protocol: 'http:',
    hostname: 'localhost',
    port: '3000'
  }
};

// Import the modules
const { RoomManager } = require('../WsCore.Client/src/network/rooms/RoomManager.js');
const { CommunicationMode } = require('../WsCore.Client/src/network/rooms/CommunicationMode.js');

console.log('=== Room Join Issue Test ===');

async function testRoomJoinSequence() {
  console.log('\n1. Creating room manager...');
  const roomManager = new RoomManager();
  
  // Initialize default rooms
  roomManager.createRoom('lobby', 'Lobby', [CommunicationMode.TextChat]);
  roomManager.createRoom('2d-game', '2D Game Room', [CommunicationMode.Spatial2D, CommunicationMode.TextChat]);
  
  const clientId = 123;
  const clientName = 'TestClient';
  
  console.log('\n2. Initial client state:');
  console.log('- Rooms:', roomManager.getAllRooms().map(r => ({ id: r.id, clients: r.getClientIds() })));
  console.log('- Client room map:', roomManager.clientRoomMap);
  
  console.log('\n3. Step 1: Join lobby...');
  const result1 = roomManager.joinRoom(clientId, clientName, 'lobby');
  console.log('Join lobby result:', result1);
  
  console.log('\n4. State after joining lobby:');
  const currentRoom1 = roomManager.getClientRoom(clientId);
  console.log('- Current room:', currentRoom1 ? currentRoom1.id : 'none');
  console.log('- Client room map:', roomManager.clientRoomMap);
  
  console.log('\n5. Step 2: Join 2D game room...');
  const result2 = roomManager.joinRoom(clientId, clientName, '2d-game');
  console.log('Join 2D game result:', result2);
  
  console.log('\n6. State after joining 2D game:');
  const currentRoom2 = roomManager.getClientRoom(clientId);
  console.log('- Current room:', currentRoom2 ? currentRoom2.id : 'none');
  console.log('- Client room map:', roomManager.clientRoomMap);
  
  console.log('\n7. Step 3: Join lobby back (this should fail)...');
  const result3 = roomManager.joinRoom(clientId, clientName, 'lobby');
  console.log('Join lobby back result:', result3);
  
  console.log('\n8. Final state:');
  const currentRoom3 = roomManager.getClientRoom(clientId);
  console.log('- Current room:', currentRoom3 ? currentRoom3.id : 'none');
  console.log('- Client room map:', roomManager.clientRoomMap);
  
  console.log('\n=== Test Results ===');
  console.log('✓ Initial lobby join:', result1 ? 'PASS' : 'FAIL');
  console.log('✓ Join 2D game:', result2 ? 'PASS' : 'FAIL');
  console.log('✓ Join lobby back:', result3 ? 'PASS' : 'FAIL');
  
  if (!result3) {
    console.log('\n❌ ISSUE REPRODUCED: Cannot join lobby back');
    console.log('This demonstrates the room joining problem!');
  } else {
    console.log('\n✓ All joins successful - issue may be fixed');
  }
}

testRoomJoinSequence().catch(console.error);
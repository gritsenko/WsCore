# WsCore Agent System

## Overview

The WsCore Agent System provides a flexible framework for implementing autonomous game entities, AI behaviors, and interactive objects within the game world. Agents in WsCore are game objects that can exhibit complex behaviors, respond to events, and interact with other game entities.

## Agent Architecture

### Core Agent Components

#### 1. **GameObject Base Class**
All agents inherit from `GameObject`, providing fundamental properties and lifecycle management:

```typescript
// Core properties all agents share
interface GameObject {
    id: number;
    position: Vector2;
    rotation: number;
    active: boolean;
    visible: boolean;
    // Lifecycle methods
    update(deltaTime: number): void;
    destroy(): void;
}
```

#### 2. **Behavior System**
Agents use a composition-based behavior system allowing modular AI and interaction patterns:

- **Movement Behaviors**: `MoveTo`, `Follow`, `MoveByCheckpoints`
- **Combat Behaviors**: `MeleeAttacker`, `HitEffectBehavior`
- **Utility Behaviors**: `FadeOut`, `Destructable`, `Sine`

#### 3. **Component Architecture**
Agents are composed of multiple components working together:

- **Transform**: Position, rotation, scale
- **Renderer**: Visual representation
- **Collider**: Physics and interaction bounds
- **Behavior Stack**: AI and logic behaviors

## Agent Types

### 1. **Player Agents**
Human-controlled entities with network synchronization:

```csharp
public class Player : GameObject
{
    public uint ClientId { get; }
    public string Name { get; }
    public Vector2 Position { get; set; }
    // Player-specific properties and methods
}
```

### 2. **NPC Agents**
Non-player characters with autonomous behavior:

- **AI-controlled** entities with decision-making capabilities
- **Patrol routes** and waypoint navigation
- **State machines** for complex behavior patterns
- **Interaction zones** for player engagement

### 3. **Environmental Agents**
Interactive world objects:

- **Destructible objects** with health and damage states
- **Moving platforms** with predefined paths
- **Trigger volumes** for events and interactions
- **Collectible items** with pickup behaviors

## Behavior System

### Available Behaviors

#### Movement Behaviors
- **`MoveTo`**: Direct pathfinding to target location
- **`Follow`**: Track and follow other game objects
- **`MoveByCheckpoints`**: Navigate through predefined waypoints
- **`MoveUp`**: Simple upward movement pattern

#### Combat Behaviors
- **`MeleeAttacker`**: Close-range combat AI
- **`HitEffectBehavior`**: Visual feedback for damage

#### Utility Behaviors
- **`FadeOut`**: Gradual visibility reduction
- **`Destructable`**: Health-based lifecycle management
- **`Sine`**: Oscillating movement patterns
- **`TurnTo`**: Rotation toward target

### Behavior Composition

```typescript
// Example: Complex enemy agent
public class EnemyAgent : GameObject
{
    public EnemyAgent()
    {
        // Add multiple behaviors
        AddBehavior(new MoveByCheckpoints(waypoints));
        AddBehavior(new MeleeAttacker(damage, range));
        AddBehavior(new Follow(player, followDistance));
        AddBehavior(new Destructable(maxHealth));
    }
}
```

## Agent Lifecycle

### 1. **Initialization**
- Agent creation and component setup
- Initial state configuration
- Network synchronization (for multiplayer)

### 2. **Update Loop**
- Behavior execution (30 FPS fixed timestep)
- Physics simulation
- State synchronization

### 3. **Interaction**
- Collision detection and response
- Message passing between agents
- Event handling and broadcasting

### 4. **Cleanup**
- Resource disposal
- Network cleanup
- Behavior termination

## Network Synchronization

### Real-time State Sync
Agents maintain consistency across all connected clients:

```csharp
// Server-side agent state
public class NetworkedAgent : GameObject
{
    public void BroadcastState()
    {
        var stateEvent = new AgentStateUpdateEvent
        {
            AgentId = this.id,
            Position = this.position,
            Rotation = this.rotation,
            CurrentState = this.currentState
        };
        Messenger.Broadcast(stateEvent);
    }
}
```

### Client-side Prediction
Clients can predict agent movement for responsive gameplay:

- **Input prediction** for player agents
- **Dead reckoning** for smooth movement
- **Server reconciliation** for state correction

## Agent Communication

### Message Passing
Agents communicate through the event system:

```csharp
// Agent-to-agent communication
public class AgentMessenger
{
    public void SendMessage(Agent recipient, AgentMessage message)
    {
        // Route message to appropriate handler
    }

    public void BroadcastMessage(AgentMessage message)
    {
        // Send to all relevant agents
    }
}
```

### Event Types
- **AgentSpawned**: New agent enters the world
- **AgentDestroyed**: Agent removal notification
- **AgentStateChanged**: Important state transitions
- **AgentInteraction**: Collision or trigger events

## Performance Considerations

### Optimization Strategies

#### 1. **Spatial Partitioning**
- **Quadtree** or **spatial hash** for efficient collision detection
- **Frustum culling** for render optimization
- **LOD (Level of Detail)** based on distance

#### 2. **Behavior Prioritization**
- **Update frequency** based on relevance and distance
- **Sleep/wake cycles** for distant agents
- **Priority queues** for behavior execution

#### 3. **Memory Management**
- **Object pooling** for frequently created agents
- **Component reuse** across similar agent types
- **Efficient serialization** for network transmission

## Extension Points

### Custom Behaviors
Developers can create new behaviors by implementing the `IBehavior` interface:

```csharp
public interface IBehavior
{
    void Update(GameObject agent, float deltaTime);
    void OnAttach(GameObject agent);
    void OnDetach(GameObject agent);
}
```

### Custom Agent Types
New agent categories can be added by extending base classes and implementing required interfaces.

## Best Practices

### 1. **Behavior Design**
- Keep behaviors focused and single-purpose
- Use composition over inheritance for flexibility
- Implement proper cleanup in behavior destructors

### 2. **Performance**
- Minimize per-frame allocations
- Use spatial data structures for collision detection
- Implement distance-based update throttling

### 3. **Network Efficiency**
- Only send state updates when necessary
- Use delta compression for position updates
- Implement client-side prediction carefully

This agent system provides a solid foundation for creating complex, interactive game worlds while maintaining performance and extensibility.
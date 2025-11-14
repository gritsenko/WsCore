namespace WsServer.Rooms;

/// <summary>
/// Defines supported communication modes for rooms
/// </summary>
public enum CommunicationMode
{
    /// <summary>
    /// 2D spatial mode with position updates
    /// </summary>
    Spatial2D = 1,
    
    /// <summary>
    /// 3D spatial mode with position updates
    /// </summary>
    Spatial3D = 2,
    
    /// <summary>
    /// Text chat only mode
    /// </summary>
    TextChat = 3,
    
    /// <summary>
    /// Voice chat only mode
    /// </summary>
    VoiceChat = 4,
    
    /// <summary>
    /// Video chat only mode
    /// </summary>
    VideoChat = 5
}
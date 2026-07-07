/**
 * Defines supported communication modes for rooms
 */
export enum CommunicationMode {
  /**
   * Spatial mode with real-time position updates (the 3D game room).
   * Maps to the server's single RoomCompatibility.Spatial.
   */
  Spatial = 'spatial',

  /**
   * Text chat only mode
   */
  TextChat = 'text_chat',

  /**
   * Voice chat only mode
   */
  VoiceChat = 'voice_chat',

  /**
   * Video chat only mode
   */
  VideoChat = 'video_chat',
}

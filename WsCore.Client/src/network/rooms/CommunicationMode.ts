/**
 * Defines supported communication modes for rooms
 */
export enum CommunicationMode {
  /**
   * 2D spatial mode with position updates
   */
  Spatial2D = 'spatial_2d',

  /**
   * 3D spatial mode with position updates
   */
  Spatial3D = 'spatial_3d',

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

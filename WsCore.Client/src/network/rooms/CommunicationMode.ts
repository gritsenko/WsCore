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

/**
 * Maps the server's `RoomCompatibility` names (as sent in `RoomInfo.supportedModes`)
 * to client modes. Unknown names are ignored, so a newer server mode can't break the
 * client.
 */
const SERVER_MODE_NAMES: Record<string, CommunicationMode> = {
  TextChat: CommunicationMode.TextChat,
  Spatial: CommunicationMode.Spatial,
  VoiceChat: CommunicationMode.VoiceChat,
  VideoChat: CommunicationMode.VideoChat,
};

export function parseServerModes(names: readonly (string | null)[] | null): CommunicationMode[] {
  const modes: CommunicationMode[] = [];
  for (const name of names ?? []) {
    const mode = name != null ? SERVER_MODE_NAMES[name] : undefined;
    if (mode !== undefined && !modes.includes(mode)) modes.push(mode);
  }
  return modes;
}

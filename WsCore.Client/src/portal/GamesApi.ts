/**
 * The game editor's way to the server: the REST API (`/api/games…`) as the browser's own
 * user (`X-User-Key` — the same secret the socket identifies with). Pictures do not fit
 * through the socket (64 KB messages), and the agent uses the same endpoints with a token.
 */
export interface GamesApiDeps {
  /** An absolute URL of a server path (the game server; in dev not the page's origin). */
  url(path: string): string | null;
  userKey(): string;
  fetch?: typeof fetch;
}

export class GamesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
  }
}

export default class GamesApi {
  constructor(private readonly deps: GamesApiDeps) {}

  updateGame(
    id: string,
    fields: {
      title?: string;
      tagline?: string;
      description?: string;
      tags?: string[];
      slug?: string;
    }
  ): Promise<unknown> {
    return this.call('PATCH', `/api/games/${id}`, JSON.stringify(fields), 'application/json');
  }

  setPublic(id: string, isPublic: boolean): Promise<unknown> {
    return this.call(
      'POST',
      `/api/games/${id}/visibility`,
      JSON.stringify({ visibility: isPublic ? 'public' : 'team' }),
      'application/json'
    );
  }

  uploadMedia(
    id: string,
    kind: 'cover' | 'header' | 'screenshot',
    picture: Blob
  ): Promise<unknown> {
    return this.call(
      'PUT',
      `/api/games/${id}/media?kind=${kind}`,
      picture,
      picture.type || 'image/jpeg'
    );
  }

  deleteMedia(id: string, mediaId: string): Promise<unknown> {
    return this.call('DELETE', `/api/games/${id}/media/${encodeURIComponent(mediaId)}`);
  }

  setScreenshots(id: string, ids: string[]): Promise<unknown> {
    return this.call(
      'PUT',
      `/api/games/${id}/screenshots`,
      JSON.stringify({ ids }),
      'application/json'
    );
  }

  private async call(
    method: string,
    path: string,
    body?: BodyInit,
    contentType?: string
  ): Promise<unknown> {
    const url = this.deps.url(path);
    if (!url) throw new GamesApiError('Нет соединения с сервером', 0, 'offline');
    const headers: Record<string, string> = { 'X-User-Key': this.deps.userKey() };
    if (contentType) headers['Content-Type'] = contentType;
    const response = await (this.deps.fetch ?? fetch)(url, { method, headers, body });
    const text = await response.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok)
      throw new GamesApiError(
        json?.message ?? `HTTP ${response.status}`,
        response.status,
        json?.error ?? ''
      );
    return json;
  }
}

/** A picture's id from its URL (`…/game-media/{game}/{id}.{ext}`). */
export function mediaIdOf(url: string): string {
  const file = url.split('?')[0].split('/').pop() ?? '';
  return file.replace(/\.[a-z0-9]+$/i, '');
}

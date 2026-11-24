import { describe, it, expect, vi } from 'vitest';
import GamesApi, { GamesApiError, mediaIdOf } from './GamesApi';

function api(response: { status: number; body: string }) {
  const fetch = vi.fn(async () => new Response(response.body, { status: response.status }));
  return {
    fetch,
    api: new GamesApi({
      url: p => `http://srv${p}`,
      userKey: () => 'key-123',
      fetch: fetch as any,
    }),
  };
}

describe('GamesApi', () => {
  it("calls the REST API as the browser's user", async () => {
    const { fetch, api: a } = api({ status: 200, body: '{"id":"g1"}' });
    expect(await a.updateGame('g1', { tagline: 'x' })).toEqual({ id: 'g1' });
    expect(fetch).toHaveBeenCalledWith('http://srv/api/games/g1', {
      method: 'PATCH',
      headers: { 'X-User-Key': 'key-123', 'Content-Type': 'application/json' },
      body: '{"tagline":"x"}',
    });
    await a.uploadMedia('g1', 'cover', new Blob(['x'], { type: 'image/jpeg' }));
    expect((fetch.mock.calls[1] as any)[0]).toBe('http://srv/api/games/g1/media?kind=cover');
    await a.setScreenshots('g1', ['b', 'a']);
    expect((fetch.mock.calls[2] as any)[1].body).toBe('{"ids":["b","a"]}');
  });

  it("turns a refusal into an error with the server's words", async () => {
    const { api: a } = api({ status: 409, body: '{"error":"too_many","message":"At most 12"}' });
    const error = (await a.setPublic('g1', true).catch(e => e)) as GamesApiError;
    expect(error).toBeInstanceOf(GamesApiError);
    expect([error.status, error.code, error.message]).toEqual([409, 'too_many', 'At most 12']);
  });

  it('reads a picture id from its URL', () => {
    expect(mediaIdOf('http://srv/game-media/g1/ab12cd.png')).toBe('ab12cd');
  });
});

/// <reference types="node" />
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import WsConnection, {
  ClientMessageType,
  SERVER_EVENT_ROUTES,
  ServerEventHandlers,
  ServerEventType,
} from './WsConnection';

// The client's TypeId enums are hand-maintained; the server's are the source of truth
// (`public static byte TypeId => N;` on every IServerEvent / IClientRequest class under
// WsServer/WsServer/Game/Protocol/**). Parse the C# from disk and diff both ways.

const PROTOCOL_DIR = fileURLToPath(
  new URL('../../../WsServer/WsServer/Game/Protocol/', import.meta.url)
);

type Kind = 'IServerEvent' | 'IClientRequest';
interface ServerMessage {
  name: string;
  id: number;
  file: string;
}

function listCsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listCsFiles(full);
    return entry.endsWith('.cs') ? [full] : [];
  });
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Parse every class implementing IServerEvent / IClientRequest and its TypeId. */
function parseServerMessages(): Record<Kind, ServerMessage[]> {
  const result: Record<Kind, ServerMessage[]> = { IServerEvent: [], IClientRequest: [] };
  // `class Name` + optional primary constructor + base list up to the body brace.
  const classRe = /\bclass\s+(\w+)\s*(?:\([^)]*\))?\s*(?::\s*([^{]+))?\{/g;
  const typeIdRe = /\bstatic\s+byte\s+TypeId\s*(?:=>|\{\s*get;\s*\}\s*=)\s*(\d+)\s*;/;

  for (const path of listCsFiles(PROTOCOL_DIR)) {
    const src = stripComments(readFileSync(path, 'utf8'));
    const file = relative(PROTOCOL_DIR, path);
    const classes = [...src.matchAll(classRe)];
    classes.forEach((m, i) => {
      const bases = m[2] ?? '';
      const kind = (['IServerEvent', 'IClientRequest'] as const).find(k =>
        new RegExp(`\\b${k}\\b`).test(bases)
      );
      if (!kind) return;
      const body = src.slice(m.index, classes[i + 1]?.index ?? src.length);
      const idMatch = typeIdRe.exec(body);
      if (!idMatch) {
        throw new Error(
          `${m[1]} (${file}) implements ${kind} but has no parseable "static byte TypeId => N;"`
        );
      }
      result[kind].push({ name: m[1], id: Number(idMatch[1]), file });
    });
  }
  return result;
}

/** Numeric TS enum → [name, value] pairs (drops the reverse mapping). */
function enumEntries(e: Record<string, string | number>): [string, number][] {
  return Object.entries(e).filter((kv): kv is [string, number] => typeof kv[1] === 'number');
}

/** Diff server messages against a client enum; returns human-readable problems. */
function diff(server: ServerMessage[], enumName: string, clientEnum: [string, number][]): string[] {
  const problems: string[] = [];
  const client = new Map(clientEnum);
  const serverNames = new Set(server.map(s => s.name));
  for (const s of server) {
    const clientId = client.get(s.name);
    if (clientId === undefined) {
      problems.push(`${enumName} is missing ${s.name} = ${s.id} (server: ${s.file})`);
    } else if (clientId !== s.id) {
      problems.push(
        `${enumName}.${s.name} = ${clientId} but the server TypeId is ${s.id} (${s.file})`
      );
    }
  }
  for (const [name, id] of clientEnum) {
    if (!serverNames.has(name)) {
      problems.push(`${enumName}.${name} = ${id} is stale: no such server message`);
    }
  }
  return problems;
}

describe('client TypeId enums match the server protocol', () => {
  it('finds the server protocol sources', () => {
    expect(existsSync(PROTOCOL_DIR), `server protocol dir not found: ${PROTOCOL_DIR}`).toBe(true);
  });

  const server = parseServerMessages();

  it('parses a plausible number of server messages', () => {
    expect(server.IServerEvent.length).toBeGreaterThan(0);
    expect(server.IClientRequest.length).toBeGreaterThan(0);
  });

  it('ServerEventType matches every IServerEvent (name and id, both directions)', () => {
    expect(diff(server.IServerEvent, 'ServerEventType', enumEntries(ServerEventType))).toEqual([]);
  });

  it('ClientMessageType matches every IClientRequest (name and id, both directions)', () => {
    expect(
      diff(server.IClientRequest, 'ClientMessageType', enumEntries(ClientMessageType))
    ).toEqual([]);
  });
});

describe('server event dispatch table', () => {
  const events = enumEntries(ServerEventType);

  it('has exactly one route per ServerEventType, wired to the same-named class', () => {
    const problems: string[] = [];
    const routes = SERVER_EVENT_ROUTES as Record<
      number,
      (typeof SERVER_EVENT_ROUTES)[ServerEventType]
    >;
    for (const [name, id] of events) {
      const route = routes[id];
      if (!route) problems.push(`ServerEventType.${name} (${id}) has no dispatch route`);
      else if (route.type.name !== name)
        problems.push(`ServerEventType.${name} (${id}) is routed to ${route.type.name}`);
    }
    const ids = new Set(events.map(([, id]) => id));
    for (const key of Object.keys(SERVER_EVENT_ROUTES)) {
      if (!ids.has(Number(key))) problems.push(`route for unknown TypeId ${key}`);
    }
    expect(problems).toEqual([]);
  });

  it('decodes each event frame and calls exactly its on<Name> handler', () => {
    class TestConnection extends WsConnection {
      feed(frame: Uint8Array): void {
        this.processServerMessage(frame.slice().buffer);
      }
    }

    for (const [name, id] of events) {
      const conn = new TestConnection();
      const handler = `on${name}` as keyof ServerEventHandlers;
      const spies = events.map(([n]) => vi.spyOn(conn, `on${n}` as keyof ServerEventHandlers));
      const type = SERVER_EVENT_ROUTES[id as ServerEventType].type as unknown as {
        new (): object;
        serialize(v: object | null): Uint8Array;
      };
      const payload = type.serialize(new type());
      const frame = new Uint8Array(1 + payload.length);
      frame[0] = id;
      frame.set(payload, 1);

      conn.feed(frame);

      const called = spies.filter(s => s.mock.calls.length > 0);
      expect(conn[handler], `${name} should dispatch to ${handler}`).toHaveBeenCalledOnce();
      expect(called, `${name} frame triggered other handlers`).toHaveLength(1);
      expect(vi.mocked(conn[handler]).mock.calls[0][0]).toBeInstanceOf(type);
    }
  });

  it('ignores unknown TypeIds without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class TestConnection extends WsConnection {
      feed(frame: Uint8Array): void {
        this.processServerMessage(frame.slice().buffer);
      }
    }
    new TestConnection().feed(new Uint8Array([42]));
    expect(warn).toHaveBeenCalledWith('Unknown server message type: 42');
    warn.mockRestore();
  });
});

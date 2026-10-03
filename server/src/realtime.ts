import { EventEmitter } from 'events';

export type RealtimeEntity = 'tile' | 'connection' | 'order' | 'installer' | 'brigade' | 'group';
export type RealtimeAction = 'created' | 'updated' | 'deleted';

export interface RealtimeEvent {
  rev: number;
  entity: RealtimeEntity;
  action: RealtimeAction;
  tabId?: string;
  id?: string;
  data?: any;
}

// Счётчик ревизий и кольцевой буфер последних событий (в памяти).
// При перезапуске сервера буфер теряется — клиенты определяют это по смене epoch
// и делают полную синхронизацию.
const EPOCH = Date.now().toString(36);
let rev = 0;
const BUFFER_SIZE = 200;
const buffer: RealtimeEvent[] = [];
const bus = new EventEmitter();
bus.setMaxListeners(0);

export const getRealtimeEpoch = (): string => EPOCH;
export const getRealtimeRev = (): number => rev;

export function emitRealtime(
  entity: RealtimeEntity,
  action: RealtimeAction,
  opts: { tabId?: string; id?: string; data?: any } = {}
): void {
  rev += 1;
  const evt: RealtimeEvent = { rev, entity, action, ...opts };
  buffer.push(evt);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  bus.emit('event', evt);
}

export function getMissedEvents(since: number): RealtimeEvent[] {
  if (!Number.isFinite(since) || since < 0) since = 0;
  return buffer.filter(e => e.rev > since);
}

export function onRealtimeEvent(cb: (e: RealtimeEvent) => void): () => void {
  bus.on('event', cb);
  return () => bus.off('event', cb);
}

import { Router, Request, Response } from 'express';
import { verifyToken } from '../auth.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  getRealtimeEpoch,
  getRealtimeRev,
  getMissedEvents,
  onRealtimeEvent,
} from '../realtime.js';

const router = Router();

// GET /api/stream — SSE-поток событий.
// Токен передаётся в query, т.к. EventSource не умеет ставить заголовки.
// Каждое событие идёт с `id: <rev>` — при автореконнекте браузер пришлёт
// Last-Event-ID и сервер дошлёт пропущенное из буфера.
router.get('/stream', (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token is required' },
    });
    return;
  }

  let login = 'unknown';
  try {
    const payload = verifyToken(token) as any;
    login = payload?.login || 'unknown';
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (line: string) => {
    try {
      res.write(line);
    } catch {
      // Клиент уже отключился
    }
  };

  const headerSince = Number(req.headers['last-event-id']);
  const querySince = Number(req.query.since);
  const since =
    Number.isFinite(headerSince) && headerSince > 0
      ? headerSince
      : Number.isFinite(querySince) && querySince > 0
        ? querySince
        : getRealtimeRev();

  send(`: connected epoch=${getRealtimeEpoch()}\n\n`);
  for (const evt of getMissedEvents(since)) {
    send(`id: ${evt.rev}\ndata: ${JSON.stringify(evt)}\n\n`);
  }
  send(
    `id: ${getRealtimeRev()}\ndata: ${JSON.stringify({ type: 'ready', rev: getRealtimeRev(), epoch: getRealtimeEpoch() })}\n\n`
  );

  let sent = 0;
  const off = onRealtimeEvent(evt => {
    sent += 1;
    send(`id: ${evt.rev}\ndata: ${JSON.stringify(evt)}\n\n`);
  });


  const hb = setInterval(() => send('data: {"type":"ping"}\n\n'), 25000);
  const connectedAt = Date.now();
  console.log(`[sse] stream opened for ${login}`);

  req.on('close', () => {
    clearInterval(hb);
    off();
    console.log(`[sse] stream closed for ${login} after ${((Date.now() - connectedAt) / 1000).toFixed(1)}s, events sent: ${sent}`);
  });
});

// GET /api/sync?since=<rev> — догоняющий опрос для событий
// visibilitychange/online (авторизация обычным заголовком).
router.get('/sync', authMiddleware, (req: Request, res: Response) => {
  const since = Number(req.query.since) || 0;
  res.json({
    success: true,
    rev: getRealtimeRev(),
    epoch: getRealtimeEpoch(),
    events: getMissedEvents(since),
  });
});

// GET /api/poll?since=<rev> — long-poll для сетей, где висящий SSE рвётся
// (туннели/прокси с буферизацией). Держит запрос до первого события
// (макс. 20с) и отвечает обычным конечным JSON.
router.get('/poll', authMiddleware, (req: Request, res: Response) => {
  const since = Number(req.query.since) || 0;
  const missed = getMissedEvents(since);
  if (missed.length > 0) {
    res.json({
      success: true,
      rev: getRealtimeRev(),
      epoch: getRealtimeEpoch(),
      events: missed,
    });
    return;
  }

  let done = false;
  const finish = (events: ReturnType<typeof getMissedEvents>) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    off();
    res.json({
      success: true,
      rev: getRealtimeRev(),
      epoch: getRealtimeEpoch(),
      events,
    });
  };

  const timer = setTimeout(() => finish(getMissedEvents(since)), 20000);
  const off = onRealtimeEvent(() => finish(getMissedEvents(since)));

  req.on('close', () => {
    if (!done) {
      done = true;
      clearTimeout(timer);
      off();
    }
  });
});

export default router;

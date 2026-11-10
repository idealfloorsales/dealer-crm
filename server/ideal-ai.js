'use strict';
/**
 * IDEAL AI phase 0: read-only, disabled by default.
 * No model calls, no MongoDB access, no write actions, no user data sent externally.
 */
const rateLimit = require('express-rate-limit');
function install({ app }) {
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30,
    standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Слишком много запросов к IDEAL AI' } });
  const enabled = process.env.IDEAL_AI_ENABLED === 'true';
  app.get('/api/ideal-ai/status', limiter, (req, res) => {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Требуется авторизация' });
    res.json({
      enabled,
      mode: 'read-only',
      connected: false,
      availableTools: [],
      message: enabled
        ? 'IDEAL AI: подготовительный режим. Подключение модели и данных ещё не настроено.'
        : 'IDEAL AI пока выключен. Настройка выполняется отдельно от рабочей CRM.'
    });
  });
  app.post('/api/ideal-ai/chat', limiter, (req, res) => {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Требуется авторизация' });
    // Deliberately do not accept/process prompt or send it to any third party.
    res.status(503).json({
      error: 'IDEAL AI ещё не подключён',
      mode: 'read-only',
      connected: false
    });
  });
}
module.exports = { install };

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth, userId } from '../middleware/auth';
import * as conversations from '../services/conversationService';
import { history } from '../services/messageService';
import type { Realtime } from '../socket/realtime';

const uuid = z.string().uuid();

export function conversationRoutes(realtime: Realtime) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      res.json({ conversations: await conversations.listForUser(userId(req)) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/direct', validate(z.object({ userId: uuid })), async (req, res, next) => {
    try {
      const me = userId(req);
      const { conversation, created } = await conversations.getOrCreateDirect(me, res.locals.body.userId);
      if (created) await realtime.conversationCreated(conversation.id);
      res.status(created ? 201 : 200).json({ conversation });
    } catch (e) {
      next(e);
    }
  });

  router.post(
    '/group',
    validate(z.object({ name: z.string().trim().min(1).max(80), memberIds: z.array(uuid).min(1).max(100) })),
    async (req, res, next) => {
      try {
        const { name, memberIds } = res.locals.body;
        const conversation = await conversations.createGroup(userId(req), name, memberIds);
        await realtime.conversationCreated(conversation.id);
        res.status(201).json({ conversation });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    '/:id/messages',
    validate(z.object({ id: uuid }), 'params'),
    validate(
      z.object({
        cursor: uuid.optional(),
        after: uuid.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }),
      'query',
    ),
    async (req, res, next) => {
      try {
        res.json(await history(userId(req), res.locals.params.id, res.locals.query));
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}

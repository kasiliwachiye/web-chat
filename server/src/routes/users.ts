import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth, userId } from '../middleware/auth';
import { searchUsers } from '../services/userService';

const router = Router();
router.use(requireAuth);

router.get('/', validate(z.object({ search: z.string().trim().max(64).optional() }), 'query'), async (req, res, next) => {
  try {
    res.json({ users: await searchUsers(userId(req), res.locals.query.search || undefined) });
  } catch (e) {
    next(e);
  }
});

export default router;

import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

type Part = 'body' | 'query' | 'params';

/** Validates req[part] with zod; parsed value stored on res.locals[part]. */
export const validate =
  (schema: ZodTypeAny, part: Part = 'body') =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return res.status(400).json({ error: 'validation failed', details: result.error.flatten() });
    }
    res.locals[part] = result.data;
    next();
  };

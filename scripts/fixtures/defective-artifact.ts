import type { Request, Response } from 'express';

declare const db: { query(sql: string): Promise<unknown[]> };

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const id = req.query.id as string;
  await db.query(`DELETE FROM users WHERE id = ${id}`);
  res.json({ ok: true });
}

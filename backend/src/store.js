import { query } from './db.js';

// Every data route works on one of the logged-in person's stores. The browser sends its choice in the
// X-Store-Id header (or ?store_id=); a store that is not theirs is refused. With neither, their first store is used.
export async function storeContext(req, res, next) {
  const mine = `from stores s join store_members m on m.store_id = s.id where m.user_id = $1 and s.deleted_at is null`;
  const raw = req.get('x-store-id') ?? req.query.store_id;
  if (raw !== undefined && raw !== '') {
    const id = Number(raw);
    const { rows } = Number.isInteger(id) ? await query(`select s.id, s.name ${mine} and s.id = $2`, [req.user.id, id]) : { rows: [] };
    if (!rows[0]) return res.status(400).json({ error: 'Unknown store' });
    req.storeId = rows[0].id;
    req.storeName = rows[0].name;
    return next();
  }
  const { rows } = await query(`select s.id, s.name ${mine} order by s.id limit 1`, [req.user.id]);
  req.storeId = rows[0]?.id ?? null;
  req.storeName = rows[0]?.name ?? '';
  next();
}

// Multi-store and delete/restore checks against a RUNNING app. Skipped unless KUMTUN_URL is set.
// Run them with ../scripts/test-app.sh, which starts a disposable copy of the app (own database, port 8081).
// Do NOT point this at your real app: nothing is ever deleted for good, so test data would pile up in its trash.
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

const BASE = process.env.KUMTUN_URL;
const skip = !BASE;

let jar = null; // session cookie of the person the calls are made as

// `as` makes one call as someone else (a cookie string); `headers` adds extra request headers.
async function call(method, path, { store, body, as, headers } = {}) {
  const cookie = as ?? jar;
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(store ? { 'X-Store-Id': String(store) } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

async function auth(path, body, extra = {}) {
  const res = await fetch(`${BASE}/api/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('kumtun_session=') && c.length > 'kumtun_session='.length);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json, cookie, setCookie: cookies.find((c) => c.startsWith('kumtun_session=')) };
}
const PASSWORD = 'correct horse 1';
const signup = (email, extra = {}) => auth('/register', { email, password: PASSWORD, ...extra });

const created = [];
const mk = async (name, copy_from) => {
  const r = await call('POST', '/stores', { body: { name, copy_from } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  created.push(r.json.id);
  return r.json.id;
};

test('stores are isolated', { skip }, async (t) => {
  // The first account on a fresh install takes over the seeded store, like your own data when you first sign up.
  const A = await signup('a@test.local');
  assert.equal(A.status, 201, JSON.stringify(A.json));
  jar = A.cookie;
  const stores = (await call('GET', '/stores')).json;
  const origin = stores[0].id; // the original store: only read, never changed
  const before = {
    dash: (await call('GET', '/dashboard', { store: origin })).json,
    sup: (await call('GET', '/supplies', { store: origin })).json,
    soldUnits: (await call('GET', '/sales', { store: origin })).json.totals.units,
  };

  const empty = await mk('zz-empty');
  const copy = await mk('zz-copy', origin);

  await t.test('a new store starts empty', async () => {
    const d = (await call('GET', '/dashboard', { store: empty })).json;
    assert.equal(d.kpis.products_tracked, 0);
    assert.equal(d.kpis.shops, 0);
    assert.equal((await call('GET', '/supplies', { store: empty })).json.supplies.length, 0);
    assert.equal((await call('GET', '/products', { store: empty })).json.length, 0);
    assert.equal((await call('GET', '/sales', { store: empty })).json.totals.units, 0);
  });

  await t.test('a copy has the same supplies, products and shops as the original', async () => {
    const a = (await call('GET', '/dashboard', { store: origin })).json;
    const b = (await call('GET', '/dashboard', { store: copy })).json;
    assert.equal(b.kpis.products_tracked, a.kpis.products_tracked);
    assert.equal(b.kpis.shops, a.kpis.shops);
    assert.equal(b.kpis.stock_value, a.kpis.stock_value);
    assert.equal((await call('GET', '/sales', { store: copy })).json.totals.units, 0); // sold log is not copied
  });

  await t.test('changing a price in the copy does not touch the original', async () => {
    const sup = (await call('GET', '/supplies', { store: copy })).json.supplies;
    const choc = sup.find((s) => s.name === 'Dark chocolate');
    const r = await call('POST', `/supplies/${choc.id}/purchase`, { store: copy, body: { qty: 0, unit_cost: 999 } });
    assert.equal(r.status, 200);
    const orig = (await call('GET', '/supplies', { store: origin })).json.supplies.find((s) => s.name === 'Dark chocolate');
    assert.notEqual(orig.unit_cost, 999);
    assert.deepEqual((await call('GET', '/dashboard', { store: origin })).json.kpis, before.dash.kpis);
  });

  await t.test('another store cannot read or change ids it does not own', async () => {
    const shops = (await call('GET', '/shops', { store: origin })).json;
    const shop = shops[0];
    const listings = (await call('GET', `/shops/${shop.id}/listings`, { store: origin })).json;
    const listing = listings[0];
    const supply = before.sup.supplies[0];
    const product = (await call('GET', '/products', { store: origin })).json[0];

    assert.deepEqual((await call('GET', `/shops/${shop.id}/listings`, { store: empty })).json, []);
    assert.equal((await call('PATCH', `/shops/${shop.id}`, { store: empty, body: { name: 'hacked' } })).status, 404);
    assert.equal((await call('DELETE', `/shops/${shop.id}`, { store: empty })).status, 404);
    assert.equal((await call('PATCH', `/listings/${listing.id}`, { store: empty, body: { price: 1 } })).status, 404);
    assert.equal((await call('DELETE', `/listings/${listing.id}`, { store: empty })).status, 404);
    assert.equal((await call('POST', `/supplies/${supply.id}/purchase`, { store: empty, body: { qty: 1, unit_cost: 1 } })).status, 404);
    assert.equal((await call('POST', `/shops/${shop.id}/listings`, { store: empty, body: { product_id: product.id, price: 10 } })).status, 404);
    assert.equal((await call('POST', '/sales', { store: empty, body: { listing_id: listing.id, qty: 1 } })).status, 404);
    assert.equal((await call('DELETE', `/products/${product.id}`, { store: empty })).status, 404);
    assert.equal((await call('DELETE', `/supplies/${supply.id}`, { store: empty })).status, 404);

    // and nothing changed
    const after = (await call('GET', '/dashboard', { store: origin })).json;
    assert.deepEqual(after.kpis, before.dash.kpis);
    assert.equal((await call('GET', '/shops', { store: origin })).json[0].name, shop.name);
  });

  await t.test('an unknown store id is rejected', async () => {
    assert.equal((await call('GET', '/supplies', { store: 999999 })).status, 400);
  });

  await t.test('sold log, export and chat stay inside one store', async () => {
    const shop = (await call('GET', '/shops', { store: copy })).json[0];
    const listing = (await call('GET', `/shops/${shop.id}/listings`, { store: copy })).json[0];
    const sale = await call('POST', '/sales', { store: copy, body: { listing_id: listing.id, qty: 2 } });
    assert.equal(sale.status, 201);
    assert.equal((await call('GET', '/sales', { store: copy })).json.totals.units, 2);
    assert.equal((await call('GET', '/sales', { store: empty })).json.totals.units, 0);
    assert.equal((await call('GET', '/sales', { store: origin })).json.totals.units, before.soldUnits); // the copy's sale did not leak into the original
    assert.equal((await call('DELETE', `/sales/${sale.json.id}`, { store: empty })).status, 404);
    const xlsx = await fetch(`${BASE}/api/export.xlsx`, { headers: { 'X-Store-Id': String(empty), Cookie: jar } });
    assert.equal(xlsx.status, 400); // an empty store has nothing to export
    const chat = await call('POST', '/chat', { store: empty, body: { message: 'ช็อกโกแลตขึ้นราคาเป็นกิโลละ 450 แล้ว' } });
    assert.equal(chat.status, 200);
    assert.deepEqual(chat.json.impacts, []); // chocolate does not exist in the empty store
  });

  await t.test('new supply and new product (recipe in grams) work in an empty store', async () => {
    const flour = await call('POST', '/supplies', { store: empty, body: { name: 'Flour', unit: 'kg', qty: 5, unit_cost: 40 } });
    const egg = await call('POST', '/supplies', { store: empty, body: { name: 'Egg', unit: 'pc', qty: 30, unit_cost: 5 } });
    assert.equal(flour.status, 201);
    assert.equal((await call('POST', '/supplies', { store: empty, body: { name: 'flour', unit: 'kg', unit_cost: 1 } })).status, 400); // duplicate name
    const p = await call('POST', '/products', {
      store: empty,
      body: { name: 'Pancake', pieces: 4, recipe: [{ supply_id: flour.json.id, quantity: 250 }, { supply_id: egg.json.id, quantity: 2 }] },
    });
    assert.equal(p.status, 201, JSON.stringify(p.json));
    const list = (await call('GET', '/products', { store: empty })).json;
    assert.equal(list[0].recipe.find((r) => r.name === 'Flour').display, '250 g');
    assert.equal(list[0].ingredient_cost, 0.25 * 40 + 2 * 5); // 250 g of flour + 2 eggs = 20
    // a supply from another store cannot be used
    const foreign = before.sup.supplies[0].id;
    assert.equal((await call('POST', '/products', { store: empty, body: { name: 'Bad', recipe: [{ supply_id: foreign, quantity: 10 }] } })).status, 400);
    // a supply used in a recipe cannot be deleted
    assert.equal((await call('DELETE', `/supplies/${flour.json.id}`, { store: empty })).status, 400);
    assert.equal((await call('DELETE', `/products/${p.json.id}`, { store: empty })).status, 200); // moves to the trash
    const blocked = await call('DELETE', `/supplies/${flour.json.id}`, { store: empty });
    assert.equal(blocked.status, 400); // a trashed product can still be restored, so its ingredients stay
    assert.match(blocked.json.error, /\(deleted\)/);
    assert.equal((await call('POST', `/products/${p.json.id}/restore`, { store: empty })).status, 200);
  });

  await t.test('pick ingredients from another store and copy them in', async () => {
    const src = (await call('GET', `/stores/${origin}/supplies`)).json;
    assert.ok(src.length >= 3);
    const pick = src.slice(0, 2).map((s) => s.id);
    // the target store is empty at this point of the run
    const target = await mk('zz-import');
    const r = await call('POST', '/supplies/import', { store: target, body: { from_store: origin, supply_ids: pick } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.added.length, 2);
    const mine = (await call('GET', '/supplies', { store: target })).json.supplies;
    assert.equal(mine.length, 2);
    for (const s of src.slice(0, 2)) {
      const got = mine.find((m) => m.name === s.name);
      assert.equal(got.unit, s.unit);
      assert.equal(got.unit_cost, s.unit_cost);
      assert.equal(got.qty, 0); // stock is physical, it does not travel
      assert.notEqual(got.id, s.id); // a real copy, not a link
    }
    // importing the same ones again skips them instead of duplicating
    const again = await call('POST', '/supplies/import', { store: target, body: { from_store: origin, supply_ids: [...pick, src[2].id] } });
    assert.equal(again.json.added.length, 1);
    assert.equal(again.json.skipped.length, 2);
    // a copy is independent: changing its price leaves the source alone
    const copy = (await call('GET', '/supplies', { store: target })).json.supplies[0];
    await call('POST', `/supplies/${copy.id}/purchase`, { store: target, body: { qty: 0, unit_cost: 777 } });
    assert.notEqual((await call('GET', `/stores/${origin}/supplies`)).json.find((s) => s.name === copy.name).unit_cost, 777);
    // bad requests
    assert.equal((await call('POST', '/supplies/import', { store: target, body: { from_store: target, supply_ids: pick } })).status, 400); // same store
    assert.equal((await call('POST', '/supplies/import', { store: target, body: { from_store: origin, supply_ids: [] } })).status, 400);
    assert.equal((await call('POST', '/supplies/import', { store: target, body: { from_store: 999999, supply_ids: pick } })).status, 404);
    const mineIds = mine.map((m) => m.id); // ids that belong to the target, not to the source store
    assert.equal((await call('POST', '/supplies/import', { store: target, body: { from_store: origin, supply_ids: mineIds } })).status, 400); // ids that are not the source store's
  });

  await t.test('pick products one by one from another store, with their recipes', async () => {
    const src = (await call('GET', `/stores/${origin}/products`)).json;
    assert.ok(src.length >= 2 && src[0].recipe.length > 0);
    const origCost = Object.fromEntries((await call('GET', '/products', { store: origin })).json.map((p) => [p.name, p.ingredient_cost]));
    const target = await mk('zz-import-products');

    const one = await call('POST', '/products/import', { store: target, body: { from_store: origin, product_ids: [src[0].id] } });
    assert.equal(one.status, 201, JSON.stringify(one.json));
    assert.deepEqual(one.json.added, [src[0].name]);
    assert.equal(one.json.new_supplies.length, src[0].recipe.length); // the empty store gets the ingredients it needs
    let mine = (await call('GET', '/products', { store: target })).json;
    assert.equal(mine.length, 1); // only the one that was picked
    assert.equal(mine[0].ingredient_cost, origCost[src[0].name]); // same recipe, same prices, same cost
    assert.equal((await call('GET', '/supplies', { store: target })).json.supplies.length, src[0].recipe.length);
    assert.equal((await call('GET', '/shops', { store: target })).json.length, 0); // not placed in any shop

    // a second product reuses ingredients that are already there
    const two = await call('POST', '/products/import', { store: target, body: { from_store: origin, product_ids: [src[0].id, src[1].id] } });
    assert.deepEqual(two.json.skipped, [src[0].name]);
    assert.deepEqual(two.json.added, [src[1].name]);
    mine = (await call('GET', '/products', { store: target })).json;
    assert.equal(mine.length, 2);
    const supplyNames = (await call('GET', '/supplies', { store: target })).json.supplies.map((s) => s.name);
    assert.equal(new Set(supplyNames).size, supplyNames.length); // no duplicated ingredient

    // copies are independent
    const sup = (await call('GET', '/supplies', { store: target })).json.supplies[0];
    await call('POST', `/supplies/${sup.id}/purchase`, { store: target, body: { qty: 0, unit_cost: 888 } });
    const back = (await call('GET', '/products', { store: origin })).json;
    assert.deepEqual(Object.fromEntries(back.map((p) => [p.name, p.ingredient_cost])), origCost);

    // bad requests
    assert.equal((await call('POST', '/products/import', { store: target, body: { from_store: target, product_ids: [src[0].id] } })).status, 400);
    assert.equal((await call('POST', '/products/import', { store: target, body: { from_store: origin, product_ids: [] } })).status, 400);
    assert.equal((await call('POST', '/products/import', { store: target, body: { from_store: 999999, product_ids: [src[0].id] } })).status, 404);
    assert.equal((await call('POST', '/products/import', { store: target, body: { from_store: origin, product_ids: [mine[0].id] } })).status, 400); // not the source's

    // same ingredient name counted in a different unit: refuse instead of guessing
    const clash = await mk('zz-import-clash');
    const first = src.find((p) => p.recipe[0]);
    const flipped = first.recipe[0].unit === 'kg' ? 'pc' : 'kg';
    await call('POST', '/supplies', { store: clash, body: { name: first.recipe[0].name, unit: flipped, unit_cost: 1 } });
    const bad = await call('POST', '/products/import', { store: clash, body: { from_store: origin, product_ids: [first.id] } });
    assert.equal(bad.status, 400);
    assert.equal((await call('GET', '/products', { store: clash })).json.length, 0); // nothing half-imported
  });

  await t.test('deleting a product moves it to the trash and it can be restored', async () => {
    const lab = await mk('zz-trash', origin); // a copy with shops and prices to play with
    const kpis = async () => (await call('GET', '/dashboard', { store: lab })).json;
    const base = await kpis();
    const prods = (await call('GET', '/products', { store: lab })).json;
    const x = prods.find((p) => p.name.startsWith('Brownie')) ?? prods[0];

    assert.equal((await call('DELETE', `/products/${x.id}`, { store: lab })).status, 200);
    // gone from every place that lists products
    assert.ok(!(await call('GET', '/products', { store: lab })).json.some((p) => p.id === x.id));
    const trash = (await call('GET', '/products/deleted', { store: lab })).json;
    assert.equal(trash.length, 1);
    assert.equal(trash[0].name, x.name);
    assert.ok(trash[0].shop_count > 0);
    const after = await kpis();
    assert.equal(after.kpis.products_tracked, base.kpis.products_tracked - trash[0].shop_count);
    assert.ok(!after.listings.some((l) => l.product_id === x.id));
    const shops = (await call('GET', '/shops', { store: lab })).json;
    assert.equal(shops.reduce((n, s) => n + s.product_count, 0), base.kpis.products_tracked - trash[0].shop_count);
    for (const sh of shops) {
      assert.ok((await call('GET', `/shops/${sh.id}/available-products`, { store: lab })).json.every((p) => p.id !== x.id));
    }
    assert.equal((await call('GET', '/export.xlsx', { store: lab })).status, 200);
    const sums = (await call('GET', '/stores')).json.find((s) => s.id === lab);
    assert.equal(sums.product_count, prods.length - 1);
    // it cannot be sold or put in a shop while in the trash
    const shop0 = shops[0];
    assert.equal((await call('POST', `/shops/${shop0.id}/listings`, { store: lab, body: { product_id: x.id, price: 10 } })).status, 404);
    // another store cannot see or restore it
    assert.equal((await call('POST', `/products/${x.id}/restore`, { store: origin })).status, 404);
    assert.equal((await call('GET', '/products/deleted', { store: origin })).json.length, 0);
    // a copy of the store leaves the trash behind
    const clone = await mk('zz-trash-copy', lab);
    assert.equal((await call('GET', '/products', { store: clone })).json.length, prods.length - 1);

    // restore brings it back exactly as it was, with its shop prices
    assert.equal((await call('POST', `/products/${x.id}/restore`, { store: lab })).status, 200);
    const restored = await kpis();
    assert.deepEqual(restored.kpis, base.kpis);
    assert.deepEqual(restored.listings.map((l) => [l.id, l.price, l.trueCost]), base.listings.map((l) => [l.id, l.price, l.trueCost]));
    assert.equal((await call('GET', '/products/deleted', { store: lab })).json.length, 0);

    // restoring is refused if a product with that name exists meanwhile
    assert.equal((await call('DELETE', `/products/${x.id}`, { store: lab })).status, 200);
    const ing = (await call('GET', '/supplies', { store: lab })).json.supplies[0];
    assert.equal((await call('POST', '/products', { store: lab, body: { name: x.name, recipe: [{ supply_id: ing.id, quantity: 10 }] } })).status, 201);
    const clash = await call('POST', `/products/${x.id}/restore`, { store: lab });
    assert.equal(clash.status, 400);
    assert.match(clash.json.error, /already have a product/);
    // there is no way to delete for good: the product is still in the trash
    assert.equal((await call('DELETE', `/products/${x.id}?permanent=1`, { store: lab })).status, 404); // already deleted, and the option no longer exists
    assert.equal((await call('GET', '/products/deleted', { store: lab })).json.length, 1);
  });

  await t.test('supplies: delete hides, restore brings back, names cannot clash', async () => {
    const lab = await mk('zz-sup', origin);
    const list = async () => (await call('GET', '/supplies', { store: lab })).json;
    const base = await list();
    const made = await call('POST', '/supplies', { store: lab, body: { name: 'Test sugar', unit: 'kg', qty: 3, unit_cost: 5 } });
    const id = made.json.id;
    assert.equal((await list()).kpis.items, base.kpis.items + 1);
    assert.equal((await call('DELETE', `/supplies/${id}`, { store: lab })).status, 200);
    assert.ok(!(await list()).supplies.some((s) => s.id === id));
    assert.equal((await list()).kpis.items, base.kpis.items);
    assert.ok((await call('GET', '/supplies/deleted', { store: lab })).json.some((s) => s.id === id));
    assert.equal((await call('POST', `/supplies/${id}/purchase`, { store: lab, body: { qty: 1, unit_cost: 1 } })).status, 404);
    assert.equal((await call('GET', '/stores')).json.find((x) => x.id === lab).supply_count, base.kpis.items);
    // a supply used in a recipe cannot be deleted at all
    const butter = base.supplies.find((s) => s.name === 'Butter');
    assert.equal((await call('DELETE', `/supplies/${butter.id}`, { store: lab })).status, 400);
    // the name is free again while it is deleted, and then the old one cannot come back on top
    const again = await call('POST', '/supplies', { store: lab, body: { name: 'Test sugar', unit: 'kg', unit_cost: 6 } });
    assert.equal(again.status, 201);
    assert.equal((await call('POST', `/supplies/${id}/restore`, { store: lab })).status, 400);
    assert.equal((await call('DELETE', `/supplies/${again.json.id}`, { store: lab })).status, 200);
    assert.equal((await call('POST', `/supplies/${id}/restore`, { store: lab })).status, 200);
    const back = (await list()).supplies.find((s) => s.id === id);
    assert.equal(back.qty, 3);
    assert.equal(back.unit_cost, 5); // exactly as it was
    assert.equal((await call('POST', `/supplies/${id}/restore`, { store: origin })).status, 404); // other stores cannot touch it
    assert.equal((await call('POST', `/supplies/${id}/restore`, { store: lab })).status, 404); // not deleted now
  });

  await t.test('shops: delete hides the shop and its prices, restore brings them all back', async () => {
    const lab = await mk('zz-shop', origin);
    const snap = async () => (await call('GET', '/dashboard', { store: lab })).json;
    const base = await snap();
    const shops = (await call('GET', '/shops', { store: lab })).json;
    const shop = shops.find((s) => s.product_count > 0);
    assert.equal((await call('DELETE', `/shops/${shop.id}`, { store: lab })).status, 200);
    const after = await snap();
    assert.equal(after.kpis.shops, base.kpis.shops - 1);
    assert.equal(after.kpis.products_tracked, base.kpis.products_tracked - shop.product_count);
    assert.ok(!(await call('GET', '/shops', { store: lab })).json.some((s) => s.id === shop.id));
    assert.deepEqual((await call('GET', `/shops/${shop.id}/listings`, { store: lab })).json, []);
    assert.equal((await call('PATCH', `/shops/${shop.id}`, { store: lab, body: { name: 'x' } })).status, 404);
    const gone = (await call('GET', '/shops/deleted', { store: lab })).json.find((s) => s.id === shop.id);
    assert.equal(gone.product_count, shop.product_count);
    assert.equal((await call('GET', '/stores')).json.find((x) => x.id === lab).shop_count, base.kpis.shops - 1);
    assert.equal((await call('POST', `/shops/${shop.id}/restore`, { store: origin })).status, 404);
    // a copy of the store, and a new shop copied from this store, leave the deleted shop out
    const clone = await mk('zz-shop-copy', lab);
    assert.equal((await call('GET', '/shops', { store: clone })).json.length, base.kpis.shops - 1);
    assert.equal((await call('POST', `/shops/${shop.id}/restore`, { store: lab })).status, 200);
    const restored = await snap();
    assert.deepEqual(restored.kpis, base.kpis);
    assert.deepEqual(restored.listings.map((l) => [l.id, l.price, l.trueCost]), base.listings.map((l) => [l.id, l.price, l.trueCost]));
    assert.equal((await call('GET', '/shops/deleted', { store: lab })).json.length, 0);
  });

  await t.test('products in a shop: remove hides it, restore or re-adding brings the same row back', async () => {
    const lab = await mk('zz-list', origin);
    const shop = (await call('GET', '/shops', { store: lab })).json.find((s) => s.product_count > 0);
    const rows = (await call('GET', `/shops/${shop.id}/listings`, { store: lab })).json;
    const l = rows[0];
    assert.equal((await call('DELETE', `/listings/${l.id}`, { store: lab })).status, 200);
    assert.ok(!(await call('GET', `/shops/${shop.id}/listings`, { store: lab })).json.some((x) => x.id === l.id));
    const removed = (await call('GET', `/shops/${shop.id}/removed`, { store: lab })).json;
    assert.equal(removed.length, 1);
    assert.equal(removed[0].price, l.price);
    const avail = (await call('GET', `/shops/${shop.id}/available-products`, { store: lab })).json.find((p) => p.id === l.product_id);
    assert.equal(avail.suggested_price, l.price); // offers the price it had here
    assert.equal((await call('POST', `/listings/${l.id}/restore`, { store: origin })).status, 404);
    assert.equal((await call('POST', `/listings/${l.id}/restore`, { store: lab })).status, 200);
    const back = (await call('GET', `/shops/${shop.id}/listings`, { store: lab })).json.find((x) => x.id === l.id);
    assert.equal(back.price, l.price);
    assert.equal(back.trueCost, l.trueCost);
    assert.equal((await call('POST', `/listings/${l.id}/restore`, { store: lab })).status, 404); // not removed any more
    // remove again, then add the product back by hand: the same row is revived, no duplicate
    await call('DELETE', `/listings/${l.id}`, { store: lab });
    const readd = await call('POST', `/shops/${shop.id}/listings`, { store: lab, body: { product_id: l.product_id, price: 321 } });
    assert.equal(readd.status, 201);
    assert.equal(readd.json.id, l.id);
    assert.equal(readd.json.price, 321);
    assert.equal((await call('GET', `/shops/${shop.id}/removed`, { store: lab })).json.length, 0);
    assert.equal((await call('GET', `/shops/${shop.id}/listings`, { store: lab })).json.filter((x) => x.product_id === l.product_id).length, 1);
    assert.equal((await call('POST', `/shops/${shop.id}/listings`, { store: lab, body: { product_id: l.product_id, price: 5 } })).status, 400); // already in the shop
  });

  await t.test('sold log: delete hides a sale and its profit, restore brings it back', async () => {
    const lab = await mk('zz-sales', origin);
    const shop = (await call('GET', '/shops', { store: lab })).json.find((s) => s.product_count > 0);
    const l = (await call('GET', `/shops/${shop.id}/listings`, { store: lab })).json[0];
    const sale = (await call('POST', '/sales', { store: lab, body: { listing_id: l.id, qty: 2, sold_on: '2026-10-10' } })).json;
    const totals = async () => (await call('GET', '/sales', { store: lab })).json.totals;
    assert.equal((await totals()).units, 2);
    assert.equal((await call('DELETE', `/sales/${sale.id}`, { store: lab })).status, 200);
    assert.equal((await totals()).units, 0);
    assert.equal((await call('GET', '/sales', { store: lab })).json.days.length, 0);
    assert.equal((await call('GET', '/stores')).json.find((x) => x.id === lab).month.units, 0);
    const trash = (await call('GET', '/sales/deleted', { store: lab })).json;
    assert.equal(trash.length, 1);
    assert.equal(trash[0].profit, sale.profit);
    assert.equal((await call('GET', '/export.xlsx', { store: lab })).status, 200);
    assert.equal((await call('POST', `/sales/${sale.id}/restore`, { store: origin })).status, 404);
    assert.equal((await call('POST', `/sales/${sale.id}/restore`, { store: lab })).status, 200);
    const t2 = await totals();
    assert.equal(t2.units, 2);
    assert.equal(t2.profit, sale.profit);
    assert.equal((await call('GET', '/sales/deleted', { store: lab })).json.length, 0);
  });

  await t.test('stores: delete hides a whole store, restore brings it back with everything in it', async () => {
    const lab = await mk('zz-store', origin);
    const before = (await call('GET', '/dashboard', { store: lab })).json;
    assert.equal((await call('DELETE', `/stores/${lab}`)).status, 200);
    assert.ok(!(await call('GET', '/stores')).json.some((s) => s.id === lab));
    assert.ok((await call('GET', '/stores/deleted')).json.some((s) => s.id === lab));
    assert.equal((await call('GET', '/supplies', { store: lab })).status, 400); // a deleted store cannot be opened
    assert.equal((await call('GET', `/stores/${lab}/supplies`)).status, 404);
    assert.equal((await call('POST', '/stores', { body: { name: 'zz-from-deleted', copy_from: lab } })).status, 404);
    assert.equal((await call('PATCH', `/stores/${lab}`, { body: { name: 'x' } })).status, 404);
    assert.equal((await call('DELETE', `/stores/${lab}`)).status, 404);
    assert.equal((await call('POST', `/stores/${lab}/restore`)).status, 200);
    assert.ok((await call('GET', '/stores')).json.some((s) => s.id === lab));
    assert.deepEqual((await call('GET', '/dashboard', { store: lab })).json.kpis, before.kpis);
    assert.equal((await call('POST', `/stores/${lab}/restore`)).status, 404); // not deleted now
  });

  await t.test('accounts: sign up, log in, log out, and the API needs a login', async () => {
    // nothing works without a login, except the health check
    assert.equal((await call('GET', '/health', { as: '' })).status, 200);
    for (const [m, p] of [['GET', '/stores'], ['GET', '/supplies'], ['GET', '/capabilities'], ['POST', '/chat'], ['GET', '/export.xlsx']]) {
      assert.equal((await call(m, p, { as: '', body: m === 'POST' ? { message: 'hi' } : undefined })).status, 401, `${m} ${p}`);
    }
    assert.equal((await call('GET', '/auth/me', { as: '' })).status, 401);
    // sign-up checks
    assert.equal((await signup('not-an-email')).status, 400);
    assert.equal((await signup('short@test.local', { password: 'abc' })).status, 400);
    assert.equal((await signup('A@Test.Local')).status, 409); // same email, any capitals
    // the cookie is not readable by scripts and is not sent along from other sites
    assert.match(A.setCookie, /HttpOnly/i);
    assert.match(A.setCookie, /SameSite=Lax/i);
    // log in: wrong password and unknown email look the same
    const wrong = await auth('/login', { email: 'a@test.local', password: 'nope nope nope' });
    const unknown = await auth('/login', { email: 'nobody@test.local', password: 'nope nope nope' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.json.error, unknown.json.error);
    const ok = await auth('/login', { email: 'A@test.local', password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.ok(ok.cookie);
    assert.equal((await call('GET', '/auth/me', { as: ok.cookie })).json.user.email, 'a@test.local');
    assert.ok(!JSON.stringify(ok.json).includes('hash')); // nothing secret comes back
    // log out ends that session on the server, not just in the browser
    assert.equal((await call('POST', '/auth/logout', { as: ok.cookie })).status, 200);
    assert.equal((await call('GET', '/auth/me', { as: ok.cookie })).status, 401);
    assert.equal((await call('GET', '/stores', { as: ok.cookie })).status, 401);
    assert.equal((await call('GET', '/stores')).status, 200); // the other session is unaffected
    // a made-up or tampered cookie is refused
    assert.equal((await call('GET', '/stores', { as: 'kumtun_session=not-a-real-token' })).status, 401);
  });

  await t.test('accounts: guesses are slowed down and other websites are refused', async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await auth('/login', { email: 'guess@test.local', password: 'wrong wrong 1' });
    assert.equal(last.status, 429);
    // a request that comes from another website (even with a valid cookie) is blocked
    const evil = await call('POST', '/stores', { body: { name: 'evil' }, headers: { Origin: 'http://evil.example' } });
    assert.equal(evil.status, 403);
    assert.ok(!(await call('GET', '/stores')).json.some((s) => s.name === 'evil'));
  });

  await t.test('Google sign-in: sends people to Google and refuses forged returns', async () => {
    assert.equal((await call('GET', '/auth/config', { as: '' })).json.google, true);
    const start = await fetch(`${BASE}/api/auth/google`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const to = new URL(start.headers.get('location'));
    assert.equal(to.host, 'accounts.google.com');
    assert.equal(to.searchParams.get('client_id'), 'test-client-id.apps.googleusercontent.com');
    assert.equal(to.searchParams.get('scope'), 'openid email profile');
    assert.match(to.searchParams.get('redirect_uri'), /\/api\/auth\/google\/callback$/);
    const state = to.searchParams.get('state');
    assert.ok(state && state.length >= 16);
    const stateCookie = start.headers.getSetCookie().find((c) => c.startsWith('kumtun_oauth='));
    assert.match(stateCookie, /HttpOnly/i);
    // coming back without the cookie we set, or with a different state, is refused and nobody is logged in
    const noCookie = await fetch(`${BASE}/api/auth/google/callback?code=abc&state=${state}`, { redirect: 'manual' });
    assert.match(noCookie.headers.get('location'), /login_error=google_failed/);
    const forged = await fetch(`${BASE}/api/auth/google/callback?code=abc&state=forged`, { redirect: 'manual', headers: { Cookie: stateCookie.split(';')[0] } });
    assert.match(forged.headers.get('location'), /login_error=google_failed/);
    assert.ok(!forged.headers.getSetCookie().some((c) => c.startsWith('kumtun_session=')));
    // the person said no on Google's page
    const denied = await fetch(`${BASE}/api/auth/google/callback?error=access_denied&state=${state}`, { redirect: 'manual', headers: { Cookie: stateCookie.split(';')[0] } });
    assert.match(denied.headers.get('location'), /login_error=google_denied/);
  });

  await t.test("one person cannot see or change another person's stores", async () => {
    const B = await signup('b@test.local'); // a second person, with sample data
    assert.equal(B.status, 201);
    const C = await signup('c@test.local', { start_with: 'empty' });
    assert.equal(C.status, 201);
    const mineA = (await call('GET', '/stores')).json;
    const mineB = (await call('GET', '/stores', { as: B.cookie })).json;
    const mineC = (await call('GET', '/stores', { as: C.cookie })).json;
    assert.equal(mineB.length, 1);
    assert.equal(mineB[0].product_count, 4); // the sample bakery
    assert.equal(mineC[0].product_count, 0); // started empty
    assert.ok(!mineB.some((s) => mineA.some((a) => a.id === s.id)));
    assert.ok(!mineA.some((s) => s.id === mineB[0].id || s.id === mineC[0].id));
    // B tries everything on A's store
    const B_ = { as: B.cookie };
    assert.equal((await call('GET', '/supplies', { ...B_, store: origin })).status, 400); // not one of their stores
    assert.equal((await call('GET', '/dashboard', { ...B_, store: origin })).status, 400);
    assert.equal((await call('POST', '/stores', { ...B_, body: { name: 'steal', copy_from: origin } })).status, 404);
    assert.equal((await call('GET', `/stores/${origin}/supplies`, B_)).status, 404);
    assert.equal((await call('GET', `/stores/${origin}/products`, B_)).status, 404);
    assert.equal((await call('PATCH', `/stores/${origin}`, { ...B_, body: { name: 'mine now' } })).status, 404);
    assert.equal((await call('DELETE', `/stores/${origin}`, B_)).status, 404);
    assert.equal((await call('POST', '/supplies/import', { ...B_, store: mineB[0].id, body: { from_store: origin, supply_ids: [1] } })).status, 404);
    assert.equal((await call('POST', '/products/import', { ...B_, store: mineB[0].id, body: { from_store: origin, product_ids: [1] } })).status, 404);
    // A's data is exactly as before
    assert.equal((await call('GET', '/stores')).json.find((s) => s.id === origin).name, stores[0].name);
    // B's only store cannot be deleted; with a spare one it can, and nobody else can see or restore it
    assert.equal((await call('DELETE', `/stores/${mineB[0].id}`, B_)).status, 400);
    const spare = await call('POST', '/stores', { ...B_, body: { name: 'B spare' } });
    assert.equal(spare.status, 201);
    assert.equal((await call('DELETE', `/stores/${spare.json.id}`, B_)).status, 200);
    assert.ok((await call('GET', '/stores/deleted', B_)).json.some((s) => s.id === spare.json.id));
    assert.ok(!(await call('GET', '/stores/deleted')).json.some((s) => s.id === spare.json.id)); // A cannot see it
    assert.equal((await call('POST', `/stores/${spare.json.id}/restore`)).status, 404); // A cannot restore it
    assert.equal((await call('POST', `/stores/${spare.json.id}/restore`, B_)).status, 200);
    // B's ids are no use to A either
    const bShop = (await call('GET', '/shops', { ...B_, store: mineB[0].id })).json[0];
    assert.equal((await call('PATCH', `/shops/${bShop.id}`, { store: origin, body: { name: 'x' } })).status, 404);
    assert.equal((await call('DELETE', `/shops/${bShop.id}`, { store: origin })).status, 404);
  });

  await t.test('the Excel file follows the language: sheet names and headers in Thai or English', async () => {
    const sheets = async (lang) => {
      const res = await fetch(`${BASE}/api/export.xlsx${lang ? `?lang=${lang}` : ''}`, { headers: { 'X-Store-Id': String(origin), Cookie: jar } });
      assert.equal(res.status, 200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
      return wb;
    };
    const en = await sheets();
    assert.ok(en.worksheets.some((w) => w.name === 'Sold Log'));
    assert.ok(en.worksheets.some((w) => w.name.startsWith('Price - ')));
    assert.equal(en.getWorksheet('Sold Log').getRow(1).getCell(1).value, 'Date');
    const th = await sheets('th');
    assert.ok(th.worksheets.some((w) => w.name === 'บันทึกยอดขาย'));
    assert.ok(th.worksheets.some((w) => w.name === 'สรุปยอดขายรายวัน'));
    assert.ok(th.worksheets.some((w) => w.name.startsWith('ราคา - ')));
    assert.equal(th.getWorksheet('บันทึกยอดขาย').getRow(1).getCell(1).value, 'วันที่');
    const price = th.worksheets.find((w) => w.name.startsWith('ราคา - '));
    assert.equal(price.getRow(1).getCell(1).value, 'สินค้า');
    assert.ok(['กำไรดี', 'กำไรบาง', 'ขาดทุน'].includes(price.getRow(2).getCell(14).value)); // status text is Thai too
    // an unknown language falls back to English
    assert.ok((await sheets('fr')).worksheets.some((w) => w.name === 'Sold Log'));
  });

  await t.test('rename and delete stores; the last store cannot be deleted', async () => {
    assert.equal((await call('PATCH', `/stores/${empty}`, { body: { name: '  ' } })).status, 400);
    assert.equal((await call('PATCH', `/stores/${empty}`, { body: { name: 'zz-renamed' } })).status, 200);
    for (const id of created.splice(0)) assert.equal((await call('DELETE', `/stores/${id}`)).status, 200);
    const left = (await call('GET', '/stores')).json;
    assert.equal(left.length, stores.length);
    assert.deepEqual((await call('GET', '/dashboard', { store: origin })).json.kpis, before.dash.kpis);
    if (left.length === 1) assert.equal((await call('DELETE', `/stores/${left[0].id}`)).status, 400);
  });
});

test.after(async () => {
  if (skip) return;
  for (const id of created) await call('DELETE', `/stores/${id}`); // clean up if a check failed midway
});

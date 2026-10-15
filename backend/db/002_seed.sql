insert into supplies (id, name, name_th, unit, qty, unit_cost, prev_unit_cost, low_stock_at) values
  (1, 'Dark chocolate', 'ช็อกโกแลต', 'kg', 2.4, 450, 400, 0.5),
  (2, 'Butter', 'เนย', 'kg', 1.8, 320, 300, 0.5),
  (3, 'Sugar', 'น้ำตาล', 'kg', 5, 30, 30, 1),
  (4, 'Cake flour', 'แป้งเค้ก', 'kg', 3.2, 40, 40, 1),
  (5, 'Eggs', 'ไข่', 'pc', 42, 4.50, 4.15, 12),
  (6, 'Cream cheese', 'ครีมชีส', 'kg', 0.6, 380, 380, 1),
  (7, 'Matcha powder', 'ชาเขียว', 'kg', 0.15, 1200, 1200, 0.2),
  (8, 'Box + label', 'กล่อง', 'pc', 85, 12, 12, 20);
select setval('supplies_id_seq', 8);

insert into products (id, name, name_th, pieces) values
  (1, 'Brownie box (6 pcs)', 'บราวนี่กล่อง', 6),
  (2, 'Butter cookie jar', 'คุกกี้เนย', 1),
  (3, 'Matcha cake slice', 'เค้กมัทฉะ', 1),
  (4, 'Cheesecake cup', 'ชีสเค้กถ้วย', 1);
select setval('products_id_seq', 4);

insert into recipe_items (product_id, supply_id, amount, display) values
  (1, 1, 0.2, '200 g'), (1, 2, 0.12, '120 g'), (1, 3, 0.15, '150 g'), (1, 4, 0.08, '80 g'), (1, 5, 3, '3 pcs'), (1, 8, 1, '1 pc'),
  (2, 2, 0.1, '100 g'), (2, 4, 0.2, '200 g'), (2, 3, 0.05, '50 g'), (2, 5, 1, '1 pc'), (2, 8, 1, '1 pc'),
  (3, 4, 0.05, '50 g'), (3, 2, 0.05, '50 g'), (3, 3, 0.05, '50 g'), (3, 5, 1, '1 pc'), (3, 7, 0.01, '10 g'), (3, 8, 1, '1 pc'),
  (4, 6, 0.1, '100 g'), (4, 2, 0.025, '25 g'), (4, 5, 1, '1 pc'), (4, 8, 1, '1 pc');

-- Real fees from shop-fee.md (regular food seller, Thailand, Aug 2026, VAT included).
insert into shops (id, name, commission_pct, transaction_pct, shipping_pct, extra_pct, extra_cap_per_item, fixed_fee_per_order, platform) values
  (1, 'Shopee shop', 16.05, 3.21, 0, 0, null, 1.07, 'shopee'),
  (2, 'LINE shop', 0, 3.21, 0, 0, null, 0, 'line');
select setval('shops_id_seq', 2);

insert into listings (id, shop_id, product_id, price, ads_per_order, wear_per_order) values
  (1, 1, 1, 289, 25, 6),
  (2, 1, 2, 159, 15, 4),
  (3, 1, 3, 79, 15, 3),
  (4, 1, 4, 99, 20, 4),
  (5, 2, 1, 260, 0, 6),
  (6, 2, 2, 150, 0, 4);
select setval('listings_id_seq', 6);

insert into price_changes (supply_id, old_cost, new_cost, source, created_at) values
  (1, 400, 450, 'chat', now()),
  (5, 4.15, 4.50, 'receipt', now() - interval '2 days'),
  (2, 300, 320, 'receipt', now() - interval '3 days');

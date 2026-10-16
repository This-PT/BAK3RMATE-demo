import { Router } from 'express';
import ExcelJS from 'exceljs';
import { computeListings } from '../services/listings.js';
import { fetchSales, validDate } from '../services/sales.js';

export const exportRouter = Router();

// Sheet names, column headers and labels in the language the person is using (?lang=th or en).
const TEXT = {
  en: {
    pricePrefix: 'Price - ',
    soldLog: 'Sold Log',
    soldDaily: 'Sold Daily Summary',
    total: 'Total',
    noSales: 'No sales logged in this period.',
    status: { losing: 'Losing money', thin: 'Thin margin', healthy: 'Healthy' },
    h: { product: 'Product', price: 'Price', ing: 'Ingredient cost', commission: 'Commission', transaction: 'Transaction fee', extra: 'Growth / service fee', shipping: 'Shipping program', fixedFee: 'Platform fee per order', ads: 'Ads', wear: 'Wear', trueCost: 'True cost', profit: 'Profit', margin: 'Margin %', status: 'Status' },
    log: { date: 'Date', shop: 'Shop', product: 'Product', qty: 'Qty', price: 'Price each', revenue: 'Revenue', costEach: 'True cost each', cost: 'True cost', profit: 'Profit', margin: 'Margin %' },
    daily: { date: 'Date', units: 'Units sold', revenue: 'Revenue', cost: 'True cost', profit: 'Profit', margin: 'Margin %' },
  },
  th: {
    pricePrefix: 'ราคา - ',
    soldLog: 'บันทึกยอดขาย',
    soldDaily: 'สรุปยอดขายรายวัน',
    total: 'รวม',
    noSales: 'ไม่มีการบันทึกยอดขายในช่วงนี้',
    status: { losing: 'ขาดทุน', thin: 'กำไรบาง', healthy: 'กำไรดี' },
    h: { product: 'สินค้า', price: 'ราคาขาย', ing: 'ต้นทุนวัตถุดิบ', commission: 'ค่าคอมมิชชัน', transaction: 'ค่าธรรมเนียมการชำระเงิน', extra: 'ค่าธรรมเนียมการเติบโต / ค่าบริการ', shipping: 'โปรแกรมส่งฟรี', fixedFee: 'ค่าแพลตฟอร์มต่อออเดอร์', ads: 'ค่าโฆษณา', wear: 'ค่าเสื่อม', trueCost: 'ต้นทุนจริง', profit: 'กำไร', margin: 'อัตรากำไร %', status: 'สถานะ' },
    log: { date: 'วันที่', shop: 'ช่องทางขาย', product: 'สินค้า', qty: 'จำนวน', price: 'ราคาต่อชิ้น', revenue: 'รายได้', costEach: 'ต้นทุนจริงต่อชิ้น', cost: 'ต้นทุนจริง', profit: 'กำไร', margin: 'อัตรากำไร %' },
    daily: { date: 'วันที่', units: 'จำนวนที่ขาย', revenue: 'รายได้', cost: 'ต้นทุนจริง', profit: 'กำไร', margin: 'อัตรากำไร %' },
  },
};
const THB = '"฿"#,##0.00;[Red]-"฿"#,##0.00';
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F1E8' } };

// Excel sheet names: max 31 chars, none of  : \ / ? * [ ]  and unique inside the workbook.
function sheetName(wb, wanted) {
  const base = wanted.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 31) || 'Sheet';
  let name = base;
  for (let i = 2; wb.getWorksheet(name); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  return name;
}

const styleHead = (ws) => {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = HEAD_FILL;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};

// PART 1: current price and true-cost breakdown, one sheet per shop.
function addPriceSheets(wb, rows, L) {
  const shops = [...new Map(rows.map((l) => [l.shop_id, l.shop_name])).entries()];
  for (const [shopId, shopName] of shops) {
    const ws = wb.addWorksheet(sheetName(wb, `${L.pricePrefix}${shopName}`));
    const cols = [
      ['product', L.h.product, 26],
      ['price', L.h.price, 12],
      ['ing', L.h.ing, 16],
      ['commission', L.h.commission, 13],
      ['transaction', L.h.transaction, 15],
      ['extra', L.h.extra, 19],
      ['shipping', L.h.shipping, 17],
      ['fixedFee', L.h.fixedFee, 21],
      ['ads', L.h.ads, 10],
      ['wear', L.h.wear, 10],
      ['trueCost', L.h.trueCost, 12],
      ['profit', L.h.profit, 12],
      ['margin', L.h.margin, 11],
      ['status', L.h.status, 15],
    ];
    ws.columns = cols.map(([key, header, width]) => ({ header, key, width }));
    const letter = (key) => ws.getColumn(key).letter;
    styleHead(ws);
    const mine = rows.filter((l) => l.shop_id === shopId);
    for (const l of mine) {
      ws.addRow({
        product: l.product_name,
        price: l.price,
        ing: l.ingredientCost,
        commission: l.commission,
        transaction: l.transaction,
        extra: l.extra,
        shipping: l.shipping,
        fixedFee: l.fixedFee,
        ads: l.ads,
        wear: l.wear,
        trueCost: l.trueCost,
        profit: l.profit,
        margin: l.margin / 100,
        status: L.status[l.status],
      });
    }
    const last = mine.length + 1;
    const total = ws.addRow({ product: L.total });
    const moneyKeys = ['price', 'ing', 'commission', 'transaction', 'extra', 'shipping', 'fixedFee', 'ads', 'wear', 'trueCost', 'profit'];
    for (const key of moneyKeys) {
      const c = letter(key);
      total.getCell(c).value = { formula: `SUM(${c}2:${c}${last})` };
    }
    const P = letter('price');
    const F = letter('profit');
    total.getCell(letter('margin')).value = { formula: `IF(${P}${last + 1}=0,0,${F}${last + 1}/${P}${last + 1})` };
    total.font = { bold: true };
    total.border = { top: { style: 'thin' } };
    for (let r = 2; r <= last + 1; r++) {
      for (const key of moneyKeys) ws.getCell(`${letter(key)}${r}`).numFmt = THB;
      ws.getCell(`${letter('margin')}${r}`).numFmt = '0.0%';
    }
  }
}

const asDate = (s) => new Date(`${s}T00:00:00Z`); // UTC midnight so Excel shows the same calendar day

// PART 2: the sold log (every sale, oldest first) and a per-day summary.
function addSoldSheets(wb, sold, L) {
  const log = wb.addWorksheet(sheetName(wb, L.soldLog));
  log.columns = [
    { header: L.log.date, key: 'date', width: 14 },
    { header: L.log.shop, key: 'shop', width: 24 },
    { header: L.log.product, key: 'product', width: 26 },
    { header: L.log.qty, key: 'qty', width: 8 },
    { header: L.log.price, key: 'price', width: 13 },
    { header: L.log.revenue, key: 'revenue', width: 14 },
    { header: L.log.costEach, key: 'costEach', width: 16 },
    { header: L.log.cost, key: 'cost', width: 14 },
    { header: L.log.profit, key: 'profit', width: 14 },
    { header: L.log.margin, key: 'margin', width: 11 },
  ];
  styleHead(log);
  const oldestFirst = [...sold.sales].reverse();
  for (const s of oldestFirst) {
    log.addRow({
      date: asDate(s.sold_on),
      shop: s.shop_name,
      product: s.product_name,
      qty: s.qty,
      price: s.unit_price,
      revenue: s.revenue,
      costEach: s.unit_cost,
      cost: s.cost,
      profit: s.profit,
      margin: s.margin / 100,
    });
  }
  if (oldestFirst.length === 0) {
    log.addRow({ date: L.noSales });
  } else {
    const last = oldestFirst.length + 1;
    const total = log.addRow({ date: L.total });
    for (const c of ['D', 'F', 'H', 'I']) total.getCell(c).value = { formula: `SUM(${c}2:${c}${last})` };
    total.getCell('J').value = { formula: `IF(F${last + 1}=0,0,I${last + 1}/F${last + 1})` };
    total.font = { bold: true };
    total.border = { top: { style: 'thin' } };
  }
  const logEnd = oldestFirst.length + 2;
  for (let r = 2; r <= logEnd; r++) {
    log.getCell(`A${r}`).numFmt = 'dd mmm yyyy';
    for (const c of ['E', 'F', 'G', 'H', 'I']) log.getCell(`${c}${r}`).numFmt = THB;
    log.getCell(`J${r}`).numFmt = '0.0%';
  }

  const daily = wb.addWorksheet(sheetName(wb, L.soldDaily));
  daily.columns = [
    { header: L.daily.date, key: 'date', width: 14 },
    { header: L.daily.units, key: 'units', width: 12 },
    { header: L.daily.revenue, key: 'revenue', width: 14 },
    { header: L.daily.cost, key: 'cost', width: 14 },
    { header: L.daily.profit, key: 'profit', width: 14 },
    { header: L.daily.margin, key: 'margin', width: 11 },
  ];
  styleHead(daily);
  const days = [...sold.days].reverse();
  for (const d of days) {
    daily.addRow({ date: asDate(d.date), units: d.units, revenue: d.revenue, cost: d.cost, profit: d.profit, margin: d.margin / 100 });
  }
  if (days.length === 0) {
    daily.addRow({ date: L.noSales });
  } else {
    const last = days.length + 1;
    const total = daily.addRow({ date: L.total });
    for (const c of ['B', 'C', 'D', 'E']) total.getCell(c).value = { formula: `SUM(${c}2:${c}${last})` };
    total.getCell('F').value = { formula: `IF(C${last + 1}=0,0,E${last + 1}/C${last + 1})` };
    total.font = { bold: true };
    total.border = { top: { style: 'thin' } };
  }
  for (let r = 2; r <= days.length + 2; r++) {
    daily.getCell(`A${r}`).numFmt = 'dd mmm yyyy';
    for (const c of ['C', 'D', 'E']) daily.getCell(`${c}${r}`).numFmt = THB;
    daily.getCell(`F${r}`).numFmt = '0.0%';
  }
}

// One workbook, two parts:
//   Part 1  "Price - <shop>" sheets: today's prices and true cost for the chosen products
//   Part 2  "Sold Log" and "Sold Daily Summary": what was actually sold (sales_from / sales_to optional)
exportRouter.get('/export.xlsx', async (req, res) => {
  const ids = String(req.query.listing_ids || '')
    .split(',')
    .filter((x) => x.trim() !== '')
    .map(Number)
    .filter(Number.isFinite);
  const { sales_from: from, sales_to: to } = req.query;
  if ((from && !validDate(from)) || (to && !validDate(to))) return res.status(400).json({ error: 'sales_from and sales_to must be YYYY-MM-DD' });

  let rows = await computeListings({ storeId: req.storeId });
  if (ids.length) rows = rows.filter((l) => ids.includes(l.id));
  if (!rows.length) return res.status(400).json({ error: 'No listings selected' });
  const sold = await fetchSales({ storeId: req.storeId, from: from || null, to: to || null });

  const wb = new ExcelJS.Workbook();
  const L = TEXT[req.query.lang === 'th' ? 'th' : 'en'];
  addPriceSheets(wb, rows, L);
  addSoldSheets(wb, sold, L);

  const now = new Date();
  const slug = (req.storeName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); // ASCII only, safe in a header
  const name = `bak3rmate${slug ? `-${slug}` : ''}-accounting-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.xlsx`;
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${name}"`,
  });
  await wb.xlsx.write(res);
  res.end();
});

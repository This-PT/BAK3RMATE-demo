// Offline rule-based parser. Used when OPENAI_API_KEY is missing or the call fails.
// Same tools, same engine numbers; only the wording is templated.
import { handlers, findProduct, findSupply } from './tools.js';
import { loadProducts, loadSupplies } from '../services/listings.js';
import { baht, pct } from '../format.js';

const isThai = (s) => /[฀-๿]/.test(s);

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const asciiDigits = (s) => s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

function extractPrice(text) {
  const nums = [...asciiDigits(text).replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!nums.length) return null;
  // "per kg 450" - the price is normally the last number; "1 kg ... 450" also ends on it.
  return nums[nums.length - 1];
}

export async function fallbackChat(message) {
  const th = isThai(message);
  const text = asciiDigits(message);
  const [supplies, products] = await Promise.all([loadSupplies(), loadProducts()]);
  const supply = findSupply(supplies, text);
  const product = findProduct(products, text);
  const price = extractPrice(text);
  const profitWord = /กำไร|ขาดทุน|คุ้ม|profit|margin|worth|losing/i.test(text);

  // product + profit question takes priority ("is the cheesecake still profitable?")
  if (product && profitWord) {
    const { result } = await handlers.get_product_profit({ product: product.name });
    const rows = result.listings;
    const lines = rows.map((l) => {
      if (th) {
        return l.profit < 0
          ? `${l.shop} ขาดทุน ${baht(-l.profit)} ต่อออเดอร์ (ต้นทุนจริง ${baht(l.true_cost)}) จุดคุ้มทุน ${baht(l.break_even)}`
          : `${l.shop} กำไร ${baht(l.profit)} ต่อออเดอร์ (${pct(l.margin_pct)}) จุดคุ้มทุน ${baht(l.break_even)}`;
      }
      return l.profit < 0
        ? `On ${l.shop}, ${l.product} loses ${baht(-l.profit)} per order (true cost ${baht(l.true_cost)}). Break-even is ${baht(l.break_even)}.`
        : `On ${l.shop}, ${l.product} makes ${baht(l.profit)} per order (${pct(l.margin_pct)} margin). Break-even is ${baht(l.break_even)}.`;
    });
    const head = th ? (rows.some((l) => l.profit < 0) ? 'ไม่ค่ะ ' : 'ยังกำไรค่ะ ') : rows.some((l) => l.profit < 0) ? 'No. ' : 'Yes. ';
    return { reply: head + lines.join(' '), impacts: [] };
  }

  if (supply && price !== null && !profitWord) {
    const { result, impacts, change_id } = await handlers.update_supply_price({ supply: supply.name, unit_cost: price });
    const s = result.supply;
    const names = [...new Set(impacts.filter((i) => i.kind === 'ingredient').map((i) => i.product))];
    const reply = th
      ? `รับทราบ อัปเดต ${supply.name_th || s.name} เป็น ${baht(s.new_cost)}/${s.unit} (เดิม ${baht(s.old_cost)}) กระทบ ${names.length} สินค้า`
      : `Got it. I updated ${s.name} to ${baht(s.new_cost)}/${s.unit} (was ${baht(s.old_cost)}). ${names.length} product${names.length === 1 ? '' : 's'} affected.`;
    return { reply, impacts, change_id };
  }

  if (/problem|losing|thin|ปัญหา|ขาดทุน|บางลง/i.test(text) && !product) {
    const { result } = await handlers.list_problem_products();
    const rows = result.listings;
    const reply = rows.length
      ? (th ? 'สินค้าที่ต้องระวัง: ' : 'Needs attention: ') +
        rows.map((l) => `${l.product} (${l.shop}) ${pct(l.margin_pct)}`).join(', ')
      : th ? 'ทุกอย่างยังมีกำไรดีค่ะ' : 'Everything is healthy right now.';
    return { reply, impacts: [] };
  }

  return {
    reply: th
      ? 'ขอโทษค่ะ ไม่แน่ใจว่าหมายถึงสินค้าหรือวัตถุดิบอะไร ลองบอกชื่อและราคาอีกครั้งได้ไหมคะ'
      : "Sorry, I couldn't tell which product or supply you mean. Could you give the name and the price?",
    impacts: [],
  };
}

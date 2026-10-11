// Вымышленные УНП, ИНН и КПП: специально не проходят проверку контрольной суммы.

const UNP_W = [29, 23, 19, 17, 13, 7, 5, 3];
const INN10_W = [2, 4, 10, 3, 5, 9, 4, 6, 8];

export function unpCheckDigit(first8: string): number | null {
  const s = first8.split("").reduce((acc, ch, i) => acc + Number(ch) * UNP_W[i], 0);
  const c = s % 11;
  return c === 10 ? null : c;
}

/** Проходит ли УНП проверку контрольной цифры */
export function isValidUnp(unp: string): boolean {
  if (!/^\d{9}$/.test(unp)) return false;
  const c = unpCheckDigit(unp.slice(0, 8));
  return c !== null && c === Number(unp[8]);
}

export function isValidInn10(inn: string): boolean {
  if (!/^\d{10}$/.test(inn)) return false;
  const s = INN10_W.reduce((acc, w, i) => acc + w * Number(inn[i]), 0);
  return (s % 11) % 10 === Number(inn[9]);
}

export function isValidInn12(inn: string): boolean {
  if (!/^\d{12}$/.test(inn)) return false;
  const w1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  const w2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  const c1 = (w1.reduce((a, w, i) => a + w * Number(inn[i]), 0) % 11) % 10;
  const c2 = (w2.reduce((a, w, i) => a + w * Number(inn[i]), 0) % 11) % 10;
  return c1 === Number(inn[10]) && c2 === Number(inn[11]);
}

/** Портит последнюю цифру, чтобы номер точно не прошёл проверку */
export function fakeUnp(first8: string): string {
  const c = unpCheckDigit(first8);
  const wrong = c === null ? 0 : (c + 3) % 10;
  return first8 + wrong;
}

export function fakeInn10(first9: string): string {
  const s = INN10_W.reduce((acc, w, i) => acc + w * Number(first9[i]), 0);
  const c = (s % 11) % 10;
  return first9 + ((c + 4) % 10);
}

// Банковские реквизиты тоже выдуманные и специально не проходят проверку.

const ACC_W = [7, 1, 3];

/** Ключ российского счёта: 3 последние цифры БИК + 20 цифр счёта, веса 7-1-3 */
export function isValidRuAccount(bik: string, account: string): boolean {
  if (!/^\d{9}$/.test(bik) || !/^\d{20}$/.test(account)) return false;
  const s = (bik.slice(-3) + account).split("").reduce((acc, ch, i) => acc + ((Number(ch) * ACC_W[i % 3]) % 10), 0);
  return s % 10 === 0;
}

/** Счёт с испорченным контрольным ключом (9-я цифра) */
export function fakeRuAccount(bik: string, first8: string, tail11: string): string {
  for (let k = 0; k < 10; k++) {
    const acc = first8 + k + tail11;
    if (!isValidRuAccount(bik, acc)) return acc;
  }
  return first8 + "0" + tail11;
}

/** БИК российского банка: 04, код региона, подразделение, номер банка не меньше 050 */
export function isPlausibleBik(bik: string): boolean {
  return /^04\d{7}$/.test(bik) && Number(bik.slice(6)) >= 50;
}

/** КПП: код инспекции, причина постановки, порядковый номер не 000 */
export function isPlausibleKpp(kpp: string): boolean {
  return /^\d{4}[\dA-Z]{2}\d{3}$/.test(kpp) && kpp.slice(0, 4) !== "0000" && kpp.slice(6) !== "000";
}

/** IBAN: контрольные цифры по mod 97 */
export function isValidIban(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  const num = moved.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const ch of num) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

/** BIC рабочего банка: 4 буквы, страна, город; вторая цифра города 0 значит тестовый код */
export function isLiveBic(bic: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic) && bic[7] !== "0";
}

/** КПП с порядковым номером 000: такого не выдают */
export function fakeKpp(code4: string): string {
  return code4 + "01000";
}

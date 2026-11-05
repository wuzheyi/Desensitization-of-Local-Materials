/**
 * 校验位算法。用于把「像身份证的 18 位数字」和「真的是身份证」区分开，
 * 这是控制误脱敏率最有效的一层。
 */

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = '10X98765432';

/** 18 位身份证校验（GB 11643）。15 位老号无校验位，仅做格式判断。 */
export function isValidIdCard(id: string): boolean {
  if (/^\d{15}$/.test(id)) return true;
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * ID_WEIGHTS[i];
  return ID_CHECK[sum % 11] === id[17].toUpperCase();
}

const USCC_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const USCC_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

/** 统一社会信用代码校验（GB 32100）。 */
export function isValidUSCC(code: string): boolean {
  if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const idx = USCC_CHARS.indexOf(code[i]);
    if (idx < 0) return false;
    sum += idx * USCC_WEIGHTS[i];
  }
  const check = (31 - (sum % 31)) % 31;
  return USCC_CHARS[check] === code[17];
}

/** 银行卡 Luhn 校验。用于排除长数字串中的非卡号。 */
export function isLuhnValid(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

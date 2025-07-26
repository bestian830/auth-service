import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

export function validatePhoneNumber(phone: string, defaultCountry: CountryCode = 'CA'): boolean {
  if (!phone) return true; // 允许为空
  try {
    // 允许用户输入 +86137xxxx, 137xxxx, 604xxx
    const number = parsePhoneNumberFromString(phone, defaultCountry);
    return !!(number && number.isValid());
  } catch {
    return false;
  }
}

export const normalizeArabic = (str: string): string => {
  return str
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
};

const enToArMap: { [key: string]: string } = {
  'a': 'ا', 'b': 'ب', 'c': 'ك', 'd': 'د', 'e': 'ي', 'f': 'ف', 'g': 'ج',
  'h': 'ه', 'i': 'ي', 'j': 'ج', 'k': 'ك', 'l': 'ل', 'm': 'م', 'n': 'ن',
  'o': 'و', 'p': 'ب', 'q': 'ق', 'r': 'ر', 's': 'س', 't': 'ت', 'u': 'و',
  'v': 'ف', 'w': 'و', 'x': 'كس', 'y': 'ي', 'z': 'ز'
};

export const transliterate = (str: string): string => {
  let result = '';
  for (const char of str.toLowerCase()) {
    result += enToArMap[char] || char;
  }
  return result;
};

export const levenshtein = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

export const searchMedicines = (query: string, items: any[]) => {
  if (!query.trim()) return [];
  
  const isBarcode = /^\d+$/.test(query);
  const normalizedQuery = normalizeArabic(query);
  const transliteratedQuery = transliterate(query);

  return items.filter(item => {
    if (isBarcode && item.barcode && item.barcode.includes(query)) return true;
    
    const normalizedNameAr = normalizeArabic(item.nameAr);
    const normalizedNameEn = item.nameEn ? item.nameEn.toLowerCase() : '';
    
    if (
      normalizedNameAr.includes(normalizedQuery) ||
      normalizedNameEn.includes(query.toLowerCase()) ||
      normalizedNameAr.includes(transliteratedQuery)
    ) {
      return true;
    }

    if (normalizedQuery.length >= 4) {
      const distance = levenshtein(normalizedQuery, normalizedNameAr);
      if (distance <= 2 && distance > 0) return true;
    }

    return false;
  });
};
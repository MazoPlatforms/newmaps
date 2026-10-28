export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const ROMANIZATION = {
  tamil: {
    consonants: 'கஙசஞடணதநபமயரலவழளறனஜஷஸஹ', values: ['k','ng','ch','nj','t','n','th','n','p','m','y','r','l','v','zh','l','r','n','j','sh','s','h'],
    vowels: new Map(Object.entries({ 'அ':'a','ஆ':'aa','இ':'i','ஈ':'ii','உ':'u','ஊ':'uu','எ':'e','ஏ':'ee','ஐ':'ai','ஒ':'o','ஓ':'oo','ஔ':'au' })),
    signs: new Map(Object.entries({ 'ா':'aa','ி':'i','ீ':'ii','ு':'u','ூ':'uu','ெ':'e','ே':'ee','ை':'ai','ொ':'o','ோ':'oo','ௌ':'au' })), halant: '்',
  },
  sinhala: {
    consonants: 'කඛගඝඟචඡජඣඤටඨඩඪණතථදධනපඵබභමයරලවශෂසහළෆ', values: ['k','kh','g','gh','ng','ch','chh','j','jh','ny','t','th','d','dh','n','th','th','d','dh','n','p','ph','b','bh','m','y','r','l','w','sh','sh','s','h','l','f'],
    vowels: new Map(Object.entries({ 'අ':'a','ආ':'aa','ඇ':'ae','ඈ':'aae','ඉ':'i','ඊ':'ii','උ':'u','ඌ':'uu','එ':'e','ඒ':'ee','ඓ':'ai','ඔ':'o','ඕ':'oo','ඖ':'au' })),
    signs: new Map(Object.entries({ 'ා':'aa','ැ':'ae','ෑ':'aae','ි':'i','ී':'ii','ු':'u','ූ':'uu','ෙ':'e','ේ':'ee','ෛ':'ai','ො':'o','ෝ':'oo','ෞ':'au' })), halant: '්',
  },
};
const HAS_INDIC_TEXT = /[\u0B80-\u0BFF\u0D80-\u0DFF]/u;

// A search-only, reversible-ish romanization aid. Canonical names are never changed;
// spellings are intentionally approximate and the original Unicode match remains.
export function transliterateSearchText(value) {
  const input = String(value ?? '').normalize('NFC');
  let output = '';
  for (const char of input) {
    const table = /[\u0B80-\u0BFF]/u.test(char) ? ROMANIZATION.tamil
      : /[\u0D80-\u0DFF]/u.test(char) ? ROMANIZATION.sinhala : null;
    if (!table) { output += char; continue; }
    if (table.vowels.has(char)) { output += table.vowels.get(char); continue; }
    const consonantIndex = [...table.consonants].indexOf(char);
    if (consonantIndex >= 0) { output += table.values[consonantIndex] + 'a'; continue; }
    if (char === table.halant) { output = output.replace(/a$/, ''); continue; }
    const sign = table.signs.get(char);
    if (sign) { output = output.replace(/a$/, sign); continue; }
    if (/\p{M}/u.test(char)) continue;
    output += char;
  }
  return normalizeSearchText(output);
}

function resolveAlias(id, aliases = {}) {
  const seen = new Set();
  while (Object.hasOwn(aliases, id)) {
    if (seen.has(id)) return id;
    seen.add(id);
    id = typeof aliases[id] === "string" ? aliases[id] : aliases[id]?.canonical_id;
  }
  return id;
}

function editDistanceAtMost(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[right.length];
}

function fuzzyTokenMatch(queryToken, textTokens) {
  if (textTokens.some((token) => token.startsWith(queryToken))) return true;
  if (queryToken.length < 5) return false;
  const maximum = queryToken.length >= 8 ? 2 : 1;
  return textTokens.some((token) => editDistanceAtMost(queryToken, token, maximum) <= maximum);
}

function fieldScore(query, tokens, text, words, base) {
  if (!text) return 0;
  if (text === query) return base + 100;
  if (text.startsWith(query)) return base + 80;
  if (text.includes(query)) return base + 60;
  const matched = tokens.filter((token) => fuzzyTokenMatch(token, words)).length;
  if (!matched) return 0;
  return base + Math.round((matched / tokens.length) * 45) - (matched < tokens.length ? 25 : 0);
}

export function distanceMeters(from, to) {
  const values = [from?.latitude, from?.longitude, to?.latitude, to?.longitude].map(Number);
  if (!values.every(Number.isFinite) || Math.abs(values[0]) > 90 || Math.abs(values[2]) > 90 ||
      Math.abs(values[1]) > 180 || Math.abs(values[3]) > 180) return null;
  const [lat1, lon1, lat2, lon2] = values.map((value, index) => index % 2 === 0 ? value * Math.PI / 180 : value * Math.PI / 180);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createPlaceSearchIndex(places, aliases = {}) {
  const candidates = [...(places ?? [])].sort((a, b) => {
    const aCanonical = a?.id === resolveAlias(a?.id, aliases) ? 0 : 1;
    const bCanonical = b?.id === resolveAlias(b?.id, aliases) ? 0 : 1;
    return aCanonical - bCanonical;
  });
  const seen = new Set();
  const indexed = [];
  for (const place of candidates) {
    if (!place?.id || !place?.name) continue;
    const canonicalId = resolveAlias(place.id, aliases);
    if (seen.has(canonicalId)) continue;
    seen.add(canonicalId);
    const categories = (Array.isArray(place.categories) ? place.categories : []).map((value) => {
      const text = normalizeSearchText(value);
      return { text, words: text ? text.split(" ") : [] };
    });
    const name = normalizeSearchText(place.name);
    const address = normalizeSearchText(place.address);
    indexed.push({
      place, canonicalId, categories, name, nameWords: name ? name.split(" ") : [],
      romanizedName: HAS_INDIC_TEXT.test(place.name) ? transliterateSearchText(place.name) : name,
      address, addressWords: address ? address.split(" ") : [],
      romanizedAddress: HAS_INDIC_TEXT.test(String(place.address ?? '')) ? transliterateSearchText(place.address) : address,
      discoveryCategory: normalizeSearchText(place.discoveryCategory ?? ""),
    });
  }

  return {
    size: indexed.length,
    search({ query = "", category = "all", origin = null, limit = 30, maxDistanceMeters = Infinity } = {}) {
      const normalizedQuery = normalizeSearchText(query);
      const romanizedQuery = HAS_INDIC_TEXT.test(String(query)) ? transliterateSearchText(query) : normalizedQuery;
      const tokens = normalizedQuery ? normalizedQuery.split(" ") : [];
      const normalizedCategory = normalizeSearchText(category);
      const results = [];
      for (const entry of indexed) {
        const { place, canonicalId, categories } = entry;
        if (category !== "all" && entry.discoveryCategory !== normalizedCategory &&
            !categories.some((item) => item.text === normalizedCategory)) continue;

        const distance = origin ? distanceMeters(origin, place.coordinates) : null;
        if (origin && (distance === null || distance > maxDistanceMeters)) continue;
        const score = normalizedQuery
          ? Math.max(
              fieldScore(normalizedQuery, tokens, entry.name, entry.nameWords, 700),
              entry.romanizedName === entry.name ? 0 : fieldScore(romanizedQuery, romanizedQuery.split(" "), entry.romanizedName, entry.romanizedName.split(" "), 680),
              ...categories.map((item) => fieldScore(normalizedQuery, tokens, item.text, item.words, 250)),
              fieldScore(normalizedQuery, tokens, entry.address, entry.addressWords, 150),
              entry.romanizedAddress === entry.address ? 0 : fieldScore(romanizedQuery, romanizedQuery.split(" "), entry.romanizedAddress, entry.romanizedAddress.split(" "), 140),
            )
          : 0;
        if (normalizedQuery && score === 0) continue;
        results.push({ place, canonicalId, score, distanceMeters: distance });
      }

      results.sort((a, b) => {
        if (origin && a.distanceMeters !== b.distanceMeters) {
          if (a.distanceMeters === null) return 1;
          if (b.distanceMeters === null) return -1;
          if (!normalizedQuery) return a.distanceMeters - b.distanceMeters;
        }
        const distanceBoostA = origin && a.distanceMeters !== null ? Math.max(0, 24 - a.distanceMeters / 1000) : 0;
        const distanceBoostB = origin && b.distanceMeters !== null ? Math.max(0, 24 - b.distanceMeters / 1000) : 0;
        return (b.score + distanceBoostB) - (a.score + distanceBoostA) || a.place.name.localeCompare(b.place.name);
      });
      return results.slice(0, Math.max(0, limit));
    },
  };
}

export function searchPlaces(places, options = {}) {
  return createPlaceSearchIndex(places, options.aliases).search(options);
}

export function availableCategories(places) {
  const counts = new Map();
  for (const place of places ?? []) {
    if (place?.discoveryCategory) {
      const value = String(place.discoveryCategory).trim();
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      continue;
    }
    for (const category of place?.categories ?? []) {
      const value = String(category).trim();
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}


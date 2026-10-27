/* Map source category labels to Mazo's existing discovery filters and icons. */
export function discoveryCategoryFor(place) {
  const categories = (Array.isArray(place?.categories) ? place.categories : []).join(' ').toLowerCase();
  if (/atm|cash machine/.test(categories)) return 'atm';
  if (/\bbank\b|credit union|financial institution|financial service|money transfer/.test(categories)) return 'bank';
  if (/fuel|gas station|petrol/.test(categories)) return 'fuel';
  if (/mechanic|automotive|car repair|vehicle repair|vehicle service|auto parts|motorcycle parts|car rental|car wash|vehicle dealer/.test(categories)) return 'auto';
  if (/electronics|mobile phone|cell phone|phone store|computer|electrical|software company|telecom|telephone exchange/.test(categories)) return 'electronics';
  if (/government|municipal|public office|post office|council/.test(categories)) return 'government';
  if (/hardware|tool shop|building material/.test(categories)) return 'hardware';
  if (/landmark|historical|monument|museum|heritage|lighthouse|library|memorial/.test(categories)) return 'landmark';
  if (/salon|saloon|barber|beauty/.test(categories)) return 'salon';
  if (/sport|stadium|playground/.test(categories)) return 'sports';
  if (/transport|bus station|bus stop|taxi|railway station|train station|airport|port|travel agency|airline ticket|tour operator/.test(categories)) return 'transport';
  if (/grocery|market|supermarket|shopping mall|shopping centre|shopping center/.test(categories)) return 'market';
  if (/repair|service center|service centre|public service|photograph|studio|tailor|electrician|plumber|agency|consultant|agricultural|farm/.test(categories)) return 'services';
  if (/gym|fitness/.test(categories)) return 'gym';
  if (/jewel|goldsmith/.test(categories)) return 'jewelry';
  if (/school|education|college|university|tuition|learning|kindergarten|preschool/.test(categories)) return 'school';
  if (/stationery|print shop|bookstore|bookshop/.test(categories)) return 'stationery';
  if (/cafe|coffee|ice cream|tea shop/.test(categories)) return 'cafe';
  if (/bakery|restaurant|food|catering|cake shop|chicken shop|butcher|fishmonger|seafood|sweets|dessert|hawker center|bar\b/.test(categories)) return 'food';
  if (/hotel|lodg|guest house|resort|homestay|hostel|holiday apartment|hall|banquet/.test(categories)) return 'hotel';
  if (/mosque|worship|masjid|temple|church|shrine|religious institution/.test(categories)) return 'worship';
  if (/hospital|clinic|pharmacy|medical|health/.test(categories)) return 'health';
  if (/park|nature|tourism|tourist attraction|beach|recreation|garden|waterfall|community center|community centre/.test(categories)) return 'park';
  return 'shop';
}

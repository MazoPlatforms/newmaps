/** HTTP conditional GET validators use weak comparison for If-None-Match. */
export function ifNoneMatchMatches(value, etag) {
  if (!value || !etag) return false;
  const opaqueTag = (candidate) => candidate.trim().replace(/^W\//i, '');
  const expected = opaqueTag(etag);
  return value.split(',').some((candidate) => candidate.trim() === '*' || opaqueTag(candidate) === expected);
}

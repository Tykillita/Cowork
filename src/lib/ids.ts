/**
 * Random document id: a prefix plus `length` base-36 characters. Unlike
 * `Date.now()`, two people creating in the same millisecond never collide.
 */
export function newId(prefix: string, length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let body = "";
  for (const byte of bytes) body += (byte % 36).toString(36);
  return `${prefix}${body}`;
}

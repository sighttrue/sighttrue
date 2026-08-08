/**
 * The credentials side of the GitHub App: proving a delivery came from GitHub,
 * and proving to GitHub that a request comes from this App.
 *
 * Both directions matter and they fail in opposite ways. A webhook this accepts
 * without checking is a stranger's instruction to write a comment under this
 * App's name, on any repository it is installed on. A token minted wrongly just
 * fails, loudly, which is the safe direction.
 *
 * WebCrypto only, because this runs on workerd where `node:crypto` is not
 * available. Node's own WebCrypto implements the same interface, so the tests
 * exercise the code that ships rather than a stand-in for it.
 */

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Compare without leaking where the difference was.
 *
 * An early return on the first differing character turns a forgery into a
 * few-hundred-guess search, one character at a time, because the response time
 * says how much of the guess was right. Length is compared first and does leak
 * — the length of a SHA-256 hex digest is not a secret.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/**
 * Does this delivery carry a signature made with the webhook secret.
 *
 * The body must be the bytes GitHub sent, not a re-serialised object. Parsing
 * and re-encoding JSON changes whitespace and key order, and the signature is
 * over the original text.
 */
export async function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null,
): Promise<boolean> {
  if (secret === '' || header === null) return false;
  if (!header.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));

  return timingSafeEqual(header.slice(7).toLowerCase(), hex(signature));
}

/** Minimal DER: a tag, a length in the form the length requires, and content. */
function der(tag: number, content: Uint8Array): Uint8Array {
  const length: number[] = [];
  if (content.length < 0x80) length.push(content.length);
  else {
    const bytes: number[] = [];
    for (let n = content.length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
    length.push(0x80 | bytes.length, ...bytes);
  }

  const out = new Uint8Array(1 + length.length + content.length);
  out[0] = tag;
  out.set(length, 1);
  out.set(content, 1 + length.length);
  return out;
}

/** `AlgorithmIdentifier` for rsaEncryption: the OID, then the required NULL. */
const RSA_ALGORITHM = new Uint8Array([
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
]);

function decodePem(pem: string): { body: Uint8Array; pkcs1: boolean } {
  const pkcs1 = pem.includes('BEGIN RSA PRIVATE KEY');
  const base64 = pem
    .replace(/-----(BEGIN|END)[^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const body = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) body[i] = binary.charCodeAt(i);
  return { body, pkcs1 };
}

/**
 * The key GitHub hands out is PKCS#1 and WebCrypto imports PKCS#8 only.
 *
 * A downloaded App key begins `-----BEGIN RSA PRIVATE KEY-----`, which is the
 * bare RSAPrivateKey structure. PKCS#8 is that same structure wrapped in a
 * version, an algorithm identifier and an octet string — no re-encoding of the
 * key material, just three layers of envelope. A key already in PKCS#8 form
 * (`BEGIN PRIVATE KEY`) is passed through, because both turn up depending on
 * how the key was stored.
 */
export function toPkcs8(pem: string): Uint8Array {
  const { body, pkcs1 } = decodePem(pem);
  if (!pkcs1) return body;

  return der(0x30, [
    der(0x02, new Uint8Array([0x00])),
    RSA_ALGORITHM,
    der(0x04, body),
  ].reduce((all, part) => {
    const out = new Uint8Array(all.length + part.length);
    out.set(all);
    out.set(part, all.length);
    return out;
  }, new Uint8Array(0)));
}

/** GitHub rejects a JWT valid for longer than ten minutes. */
export const JWT_SECONDS = 540;

/**
 * A JWT that says "this is App 4527150", signed with the App's private key.
 *
 * Backdated a minute. GitHub compares `iat` against its own clock and refuses a
 * token issued in the future, which a runner drifting by seconds would produce.
 */
export async function appJwt(
  appId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    toPkcs8(privateKeyPem) as unknown as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(
    encoder.encode(
      JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + JWT_SECONDS, iss: appId }),
    ),
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(`${header}.${payload}`),
  );

  return `${header}.${payload}.${base64url(signature)}`;
}

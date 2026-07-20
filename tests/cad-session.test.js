import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOpaqueToken,
  signToken,
  verifyTokenSignature,
  createSession,
  parseSessionCookie,
  deriveSessionDigest,
} from '../api/_lib/cad-session.js';

// Mock environment
process.env.CAD_TUTOR_SESSION_SECRET = 'test-secret-key-12345';

test('Session: generateOpaqueToken produces 32 random bytes', () => {
  const token1 = generateOpaqueToken();
  const token2 = generateOpaqueToken();

  assert.ok(typeof token1 === 'string', 'token is string');
  assert.ok(typeof token2 === 'string', 'token is string');
  assert.notEqual(token1, token2, 'tokens are different');
  assert.ok(token1.length > 20, 'token is long enough');
});

test('Session: signToken produces valid signature', () => {
  const token = generateOpaqueToken();
  const secret = 'test-secret';
  const sig = signToken(token, secret);

  assert.ok(typeof sig === 'string', 'signature is string');
  assert.ok(sig.length > 10, 'signature has content');
});

test('Session: verifyTokenSignature succeeds with valid signature', () => {
  const token = generateOpaqueToken();
  const secret = 'test-secret';
  const sig = signToken(token, secret);

  const valid = verifyTokenSignature(token, sig, secret);
  assert.ok(valid, 'signature verification succeeds');
});

test('Session: verifyTokenSignature fails with tampered signature', () => {
  const token = generateOpaqueToken();
  const secret = 'test-secret';
  const sig = signToken(token, secret);
  const tampered = sig.substring(0, sig.length - 2) + 'XX';

  const valid = verifyTokenSignature(token, tampered, secret);
  assert.equal(valid, false, 'tampered signature fails');
});

test('Session: verifyTokenSignature fails with tampered token', () => {
  const token = generateOpaqueToken();
  const secret = 'test-secret';
  const sig = signToken(token, secret);
  const tamperedToken = token.substring(0, token.length - 2) + 'XX';

  const valid = verifyTokenSignature(tamperedToken, sig, secret);
  assert.equal(valid, false, 'tampered token fails');
});

test('Session: createSession trial produces valid session', () => {
  const session = createSession({ tier: 'trial' });

  assert.ok(session.token, 'token present');
  assert.ok(session.signature, 'signature present');
  assert.ok(session.cookie, 'cookie present');
  assert.equal(session.tier, 'trial', 'tier is trial');
  assert.equal(session.ownerRef, null, 'ownerRef is null for trial');
  assert.ok(session.createdAt, 'createdAt present');
  assert.ok(session.expiresAt, 'expiresAt present');
});

test('Session: createSession builder produces session with ownerRef', () => {
  const session = createSession({ tier: 'builder', ownerRef: 'test_user' });

  assert.equal(session.tier, 'builder', 'tier is builder');
  assert.equal(session.ownerRef, 'test_user', 'ownerRef is set');
});

test('Session: parseSessionCookie parses valid cookie', () => {
  const session = createSession({ tier: 'trial' });
  const parsed = parseSessionCookie(session.cookie, process.env.CAD_TUTOR_SESSION_SECRET);

  assert.ok(parsed, 'cookie parsed');
  assert.equal(parsed.token, session.token, 'token matches');
  assert.equal(parsed.signature, session.signature, 'signature matches');
});

test('Session: parseSessionCookie rejects malformed cookie', () => {
  const parsed = parseSessionCookie('invalid.format.extra', process.env.CAD_TUTOR_SESSION_SECRET);
  assert.equal(parsed, null, 'malformed cookie rejected');
});

test('Session: parseSessionCookie rejects tampered cookie', () => {
  const session = createSession({ tier: 'trial' });
  const parts = session.cookie.split('.');
  const tampered = 'XXX' + parts[0].substring(3) + '.' + parts[1];

  const parsed = parseSessionCookie(tampered, process.env.CAD_TUTOR_SESSION_SECRET);
  assert.equal(parsed, null, 'tampered cookie rejected');
});

test('Session: deriveSessionDigest produces consistent digest', () => {
  const token = generateOpaqueToken();
  const digest1 = deriveSessionDigest(token);
  const digest2 = deriveSessionDigest(token);

  assert.equal(digest1, digest2, 'digest is consistent');
  assert.ok(typeof digest1 === 'string', 'digest is string');
  assert.ok(digest1.length > 10, 'digest has content');
});

test('Session: deriveSessionDigest throws without secret', () => {
  const oldSecret = process.env.CAD_TUTOR_SESSION_SECRET;
  delete process.env.CAD_TUTOR_SESSION_SECRET;

  try {
    deriveSessionDigest('token');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('SESSION_SECRET'), 'throws about missing secret');
  } finally {
    process.env.CAD_TUTOR_SESSION_SECRET = oldSecret;
  }
});

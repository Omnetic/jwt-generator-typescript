import { generateKeyPairSync, type KeyObject } from 'node:crypto';

import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';

import { generateToken, InvalidArgumentError } from '../src/index';

const KID = 'kid-uuid-1';

function generateRsaKeyPair(modulusLength = 2048): { privateKeyPem: string; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength });

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey,
  };
}

function generateEcPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function decodeSegment(token: string, index: number): Record<string, unknown> {
  const segment = token.split('.')[index];

  return JSON.parse(Buffer.from(segment, 'base64url').toString()) as Record<string, unknown>;
}

describe('InvalidArgumentError', () => {
  it('is an Error subclass with the given message and a stable name', () => {
    const error = new InvalidArgumentError('boom');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
    expect(error.name).toBe('InvalidArgumentError');
  });
});

describe('generateToken', () => {
  it('returns a compact JWT with three segments', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    const token = await generateToken(privateKeyPem, KID);

    expect(token.split('.')).toHaveLength(3);
  });

  it('uses RS256 in the header and carries the kid', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    const token = await generateToken(privateKeyPem, KID);
    const header = decodeSegment(token, 0);

    expect(header['alg']).toBe('RS256');
    expect(header['typ']).toBe('JWT');
    expect(header['kid']).toBe(KID);
  });

  it('carries the service-account claims and no legacy typ payload claim', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    const before = Math.floor(Date.now() / 1000);
    const token = await generateToken(privateKeyPem, KID, 1800);
    const after = Math.floor(Date.now() / 1000);
    const payload = decodeSegment(token, 1);

    expect(payload['type']).toBe('sa');
    expect(payload['sub']).toBe(KID);
    expect(payload).not.toHaveProperty('typ');

    const issuedAt = payload['iat'] as number;
    const expiresAt = payload['exp'] as number;
    expect(issuedAt).toBeGreaterThanOrEqual(before);
    expect(issuedAt).toBeLessThanOrEqual(after);
    expect(expiresAt).toBe(issuedAt + 1800);
  });

  it('defaults the lifetime to one hour', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    const token = await generateToken(privateKeyPem, KID);
    const payload = decodeSegment(token, 1);

    const issuedAt = payload['iat'] as number;
    const expiresAt = payload['exp'] as number;
    expect(expiresAt - issuedAt).toBe(3600);
  });

  it('produces a signature that verifies with the matching public key', async () => {
    const { privateKeyPem, publicKey } = generateRsaKeyPair();

    const token = await generateToken(privateKeyPem, KID);
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });

    expect(payload['type']).toBe('sa');
  });

  it('produces a signature that a different public key rejects', async () => {
    const signing = generateRsaKeyPair();
    const other = generateRsaKeyPair();

    const token = await generateToken(signing.privateKeyPem, KID);

    await expect(jwtVerify(token, other.publicKey, { algorithms: ['RS256'] })).rejects.toThrow();
  });

  it('rejects an empty kid', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    await expect(generateToken(privateKeyPem, '')).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('rejects a lifetime above the maximum', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    await expect(generateToken(privateKeyPem, KID, 3601)).rejects.toBeInstanceOf(
      InvalidArgumentError,
    );
  });

  it('rejects a non-positive lifetime', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    await expect(generateToken(privateKeyPem, KID, 0)).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('validates the kid before parsing the private key', async () => {
    await expect(generateToken('not a pem key', '')).rejects.toThrow('The kid must not be empty.');
  });

  it('validates the lifetime before parsing the private key', async () => {
    await expect(generateToken('not a pem key', KID, 3601)).rejects.toThrow(
      'The lifetime must be an integer between 1 and 3600 seconds',
    );
  });

  it('rejects an empty private key', async () => {
    await expect(generateToken('', KID)).rejects.toThrow('The private key must not be empty.');
  });

  it('rejects a malformed private key', async () => {
    await expect(generateToken('not a pem key', KID)).rejects.toThrow(
      'The private key is not a valid PEM-encoded key.',
    );
  });

  it('rejects a non-RSA private key', async () => {
    await expect(generateToken(generateEcPrivateKeyPem(), KID)).rejects.toThrow(
      'The private key must be an RSA key.',
    );
  });

  it('rejects an RSA key shorter than 2048 bits', async () => {
    const { privateKeyPem } = generateRsaKeyPair(1024);

    await expect(generateToken(privateKeyPem, KID)).rejects.toThrow('at least 2048 bits');
  });

  it('rejects a non-integer lifetime', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    await expect(generateToken(privateKeyPem, KID, 100.5)).rejects.toThrow(
      'The lifetime must be an integer between 1 and 3600 seconds',
    );
  });

  it('rejects a NaN lifetime', async () => {
    const { privateKeyPem } = generateRsaKeyPair();

    await expect(generateToken(privateKeyPem, KID, Number.NaN)).rejects.toBeInstanceOf(
      InvalidArgumentError,
    );
  });

  it('accepts a PKCS1-encoded RSA private key', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pkcs1Pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

    const token = await generateToken(pkcs1Pem, KID);

    expect(token.split('.')).toHaveLength(3);
  });
});

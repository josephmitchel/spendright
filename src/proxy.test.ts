import { describe, expect, it } from 'vitest';
import { headerHostname, isLocalRequest, isLoopbackIp, isSameOrigin } from '@/proxy';

describe('headerHostname', () => {
  it('parses plain and port-suffixed hosts', () => {
    expect(headerHostname('localhost')).toBe('localhost');
    expect(headerHostname('localhost:3000')).toBe('localhost');
    expect(headerHostname('[::1]:3000')).toBe('[::1]');
  });

  it('refuses hosts whose structure would trick new URL()', () => {
    expect(headerHostname('evil.com@localhost')).toBe(null);
    expect(headerHostname('localhost/evil')).toBe(null);
    expect(headerHostname('localhost\\evil')).toBe(null);
    expect(headerHostname('localhost?x=1')).toBe(null);
    expect(headerHostname('localhost#f')).toBe(null);
    expect(headerHostname('local host')).toBe(null);
  });
});

describe('isSameOrigin', () => {
  it('accepts a same-host http origin, case-insensitively', () => {
    expect(isSameOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isSameOrigin('http://localhost:3000', 'LocalHost:3000')).toBe(true);
  });

  it('rejects other hosts, ports, schemes, and garbage', () => {
    expect(isSameOrigin('http://evil.com', 'localhost:3000')).toBe(false);
    expect(isSameOrigin('http://localhost:4000', 'localhost:3000')).toBe(false);
    expect(isSameOrigin('https://localhost:3000', 'localhost:3000')).toBe(false);
    expect(isSameOrigin('not a url', 'localhost:3000')).toBe(false);
  });
});

describe('isLoopbackIp', () => {
  it('accepts loopback forms', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp(' 127.1.2.3 ')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
  });

  it('rejects everything else, including loopback-prefixed lookalikes', () => {
    expect(isLoopbackIp('10.0.0.1')).toBe(false);
    expect(isLoopbackIp('127.0.0.1.evil.com')).toBe(false);
    expect(isLoopbackIp('localhost')).toBe(false);
    expect(isLoopbackIp('')).toBe(false);
  });
});

const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe('isLocalRequest', () => {
  it('accepts a loopback host with loopback (or absent) forwarding headers', () => {
    expect(isLocalRequest(request({ host: 'localhost:3000' }))).toBe(true);
    expect(isLocalRequest(request({ host: '127.0.0.1:3000' }))).toBe(true);
    expect(
      isLocalRequest(
        request({
          host: 'localhost:3000',
          'x-forwarded-host': 'localhost:3000',
          'x-forwarded-for': '127.0.0.1, ::1',
        }),
      ),
    ).toBe(true);
  });

  it('rejects a missing, non-loopback, or malformed host', () => {
    expect(isLocalRequest(request({}))).toBe(false);
    expect(isLocalRequest(request({ host: 'evil.com' }))).toBe(false);
    expect(isLocalRequest(request({ host: 'evil.com@localhost' }))).toBe(false);
  });

  it('rejects forwarding headers that reveal a non-loopback hop', () => {
    expect(
      isLocalRequest(request({ host: 'localhost:3000', 'x-forwarded-host': 'evil.com' })),
    ).toBe(false);
    expect(
      isLocalRequest(request({ host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1, 10.0.0.1' })),
    ).toBe(false);
  });
});

/**
 * setup.test.js — the test environment's own contract.
 *
 * These assertions exist because the harness used to lie to the code under
 * test, and three suites failed for it while the app was correct:
 *
 *   - `useFrameTakeoffStore.receive()` files a packet into localStorage and
 *     `open()` reads it back. The old mock stored nothing, so `takeoff.incoming`
 *     was always undefined → "Cannot read properties of undefined (reading
 *     'frames')" in frameBuilderV1.incoming.test.js.
 *   - `scheduleIntake.readScheduleFile()` calls `file.arrayBuffer()`. jsdom 24's
 *     File has no such method → "file.arrayBuffer is not a function" in
 *     frameBuilderV1.schedule.test.js (twice).
 *   - `PartnerPakParser.unwrapDatContainer()` calls `new Blob([...]).stream()`
 *     and pipes it through DecompressionStream → "(intermediate value).stream
 *     is not a function" in partnerPakParser.test.js.
 *
 * If any of these fail, those suites are about to fail too — and for a reason
 * that has nothing to do with the code they are testing.
 */

import { describe, it, expect, vi } from 'vitest';

describe('localStorage actually stores', () => {
  it('round-trips a write', () => {
    localStorage.setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('returns null for a miss, not undefined', () => {
    expect(localStorage.getItem('never-written')).toBeNull();
  });

  it('round-trips the JSON a store would persist', () => {
    const takeoff = { schema: 'glazebid.frameTakeoff/1', incoming: { frames: [{ itemId: '1' }, { itemId: '2' }] } };
    localStorage.setItem('glazebid:frameTakeoff:Other', JSON.stringify(takeoff));
    const back = JSON.parse(localStorage.getItem('glazebid:frameTakeoff:Other'));
    expect(back.incoming.frames).toHaveLength(2);
    expect(back.schema).toBe('glazebid.frameTakeoff/1');
  });

  it('removeItem, clear, length and key all behave', () => {
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    expect(localStorage.length).toBe(2);
    expect(localStorage.key(0)).toBe('a');
    localStorage.removeItem('a');
    expect(localStorage.getItem('a')).toBeNull();
    expect(localStorage.length).toBe(1);
    localStorage.clear();
    expect(localStorage.length).toBe(0);
  });

  it('is still a spy, so call assertions keep working', () => {
    localStorage.setItem('spied', 'yes');
    expect(localStorage.setItem).toHaveBeenCalledWith('spied', 'yes');
    expect(vi.isMockFunction(localStorage.getItem)).toBe(true);
  });

  it('starts empty — the previous test’s writes do not leak in', () => {
    expect(localStorage.length).toBe(0);
    expect(localStorage.getItem('spied')).toBeNull();
  });

  it('sessionStorage works the same way', () => {
    sessionStorage.setItem('s', 'v');
    expect(sessionStorage.getItem('s')).toBe('v');
    expect(sessionStorage.getItem('nope')).toBeNull();
  });
});

describe('File and Blob can be read', () => {
  it('File.arrayBuffer() returns the bytes', async () => {
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'A3.1 schedule.pdf', { type: 'application/pdf' });
    const buf = await file.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(file.name).toBe('A3.1 schedule.pdf');
    expect(file.type).toBe('application/pdf');
  });

  it('a CSV File round-trips through arrayBuffer, as the schedule reader does', async () => {
    const csv = 'Mark,Width,Height\nA,48,60\n';
    const file = new File([csv], 'Window Schedule.csv', { type: 'text/csv' });
    const text = new TextDecoder().decode(await file.arrayBuffer());
    expect(text).toBe(csv);
  });

  it('base64 off a File matches what the sidecar expects', async () => {
    // scheduleIntake sends `toBase64(await file.arrayBuffer())`; %PDF → JVBERg==
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'x.pdf', { type: 'application/pdf' });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const b64 = btoa(String.fromCharCode(...bytes));
    expect(b64).toBe('JVBERg==');
  });

  it('Blob.stream() pipes through DecompressionStream, as the .dat unwrap does', async () => {
    expect(typeof new Blob(['x']).stream).toBe('function');
    expect(typeof DecompressionStream).toBe('function');

    // deflate-raw a known payload with node:zlib, then inflate it the way
    // PartnerPakParser.unwrapDatContainer does
    const { deflateRawSync } = await import('node:zlib');
    const original = new TextEncoder().encode('PartnerPak container payload');
    const deflated = new Uint8Array(deflateRawSync(original));

    const stream = new Blob([deflated]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(new TextDecoder().decode(out)).toBe('PartnerPak container payload');
  });

  it('Blob.text() and .slice() are there too', async () => {
    const b = new Blob(['hello world']);
    expect(await b.text()).toBe('hello world');
    expect(await b.slice(0, 5).text()).toBe('hello');
    expect(b.size).toBe(11);
  });
});

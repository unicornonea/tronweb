import { assert } from 'vitest';
import { Base64 } from '../../src/utils/base64.js';

const bytesOf = (s: string) => Array.from(Buffer.from(s, 'latin1'));

describe('utils.base64', function () {
    const b64 = new Base64();

    describe('#encode()', function () {
        it('should match the standard encoding for every padding length', function () {
            for (const s of ['', 'a', 'ab', 'abc', 'abcd', 'hello world']) {
                assert.equal(b64.encode(s), Buffer.from(s, 'latin1').toString('base64'));
            }
        });
    });

    describe('#encodeIgnoreUtf8()', function () {
        it('should encode raw bytes, including values above 0x7f', function () {
            const bytes = [0x00, 0xff, 0x10, 0x80, 0x7f];
            for (let n = 0; n <= bytes.length; n++) {
                const slice = bytes.slice(0, n);
                assert.equal(b64.encodeIgnoreUtf8(slice), Buffer.from(slice).toString('base64'));
            }
        });
    });

    describe('#decode()', function () {
        it('should round-trip ascii input', function () {
            for (const s of ['a', 'ab', 'abc', 'TRON network']) {
                assert.equal(b64.decode(Buffer.from(s).toString('base64')), s);
            }
        });

        it('should utf8-decode two- and three-byte sequences', function () {
            const s = 'é中文';
            assert.equal(b64.decode(Buffer.from(s, 'utf8').toString('base64')), s);
        });

        it('should ignore characters outside the base64 alphabet', function () {
            assert.equal(b64.decode('aGVs\nbG8=*'), 'hello');
        });
    });

    describe('#decodeToByteArray()', function () {
        it('should return the raw decoded bytes', function () {
            const bytes = [0x00, 0xff, 0x10, 0x80];
            assert.deepEqual(b64.decodeToByteArray(Buffer.from(bytes).toString('base64')), bytes);
            assert.deepEqual(b64.decodeToByteArray('YWI='), bytesOf('ab'));
        });
    });

    describe('#_utf8_encode()', function () {
        it('should produce utf8 byte strings and normalise CRLF', function () {
            assert.equal(b64._utf8_encode('a\r\nb'), 'a\nb');
            assert.equal(b64._utf8_encode('é'), Buffer.from('é', 'utf8').toString('latin1'));
            assert.equal(b64._utf8_encode('中'), Buffer.from('中', 'utf8').toString('latin1'));
        });
    });
});

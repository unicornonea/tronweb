import { assert } from 'vitest';
import { Validator } from '../../src/paramValidator/index.js';

const validator = new Validator();

type Bounds = { gt?: number; gte?: number; lt?: number; lte?: number };

// `notValid` throws `Invalid amount provided` for a rejected 'integer' rule and returns false otherwise.
function integer(value: unknown, bounds: Bounds = {}) {
    try {
        validator.notValid([{ name: 'amount', type: 'integer', value: value as any, ...bounds }]);
        return false;
    } catch (e: any) {
        assert.equal(e.message, 'Invalid amount provided');
        return true;
    }
}

function positive(value: unknown) {
    return () => validator.notValid([{ name: 'balance', type: 'positive-integer', value: value as any }]);
}

describe('paramValidator', function () {
    describe("'integer'", function () {
        it('accepts integer numbers', function () {
            assert.isFalse(integer(0));
            assert.isFalse(integer(1));
            assert.isFalse(integer(5_000_000_000));
            assert.isFalse(integer(-3));
        });

        it('accepts plain digit strings', function () {
            assert.isFalse(integer('0'));
            assert.isFalse(integer('1'));
            assert.isFalse(integer('5000000000'));
            assert.isFalse(integer('-3'));
            assert.isFalse(integer('9000000000000000000'));
        });

        it('accepts bigints', function () {
            assert.isFalse(integer(1n));
            assert.isFalse(integer(5_000_000_000n));
        });

        it('applies the bounds to accepted values of every kind', function () {
            assert.isTrue(integer(0, { gt: 0 }));
            assert.isFalse(integer(1, { gt: 0 }));
            assert.isTrue(integer('0', { gt: 0 }));
            assert.isFalse(integer('1', { gt: 0 }));
            assert.isTrue(integer(0n, { gt: 0 }));
            assert.isFalse(integer(1n, { gt: 0 }));
            assert.isTrue(integer(-1, { gte: 0 }));
            assert.isTrue(integer('-1', { gte: 0 }));
            assert.isTrue(integer(101, { lte: 100 }));
            assert.isTrue(integer('101', { lte: 100 }));
            assert.isFalse(integer(100, { lte: 100 }));
        });

        it('rejects non-integer numbers', function () {
            assert.isTrue(integer(1.5));
            assert.isTrue(integer(NaN));
            assert.isTrue(integer(Infinity));
        });

        it('rejects strings that only coerce to an integer', function () {
            assert.isTrue(integer(''));
            assert.isTrue(integer(' '));
            assert.isTrue(integer('1e3'));
            assert.isTrue(integer('0x10'));
            assert.isTrue(integer('12.0'));
            assert.isTrue(integer(' 12 '));
            assert.isTrue(integer('+5'));
            assert.isTrue(integer('1_000'));
            assert.isTrue(integer('１２'));
            assert.isTrue(integer('9'.repeat(400)));
            assert.isTrue(integer('-' + '9'.repeat(400)));
        });

        it('rejects booleans, arrays and null-ish values', function () {
            assert.isTrue(integer(true));
            assert.isTrue(integer(false));
            assert.isTrue(integer([]));
            assert.isTrue(integer([1]));
            assert.isTrue(integer(null));
            assert.isTrue(integer(undefined));
        });

        it('rejects objects whatever valueOf / toString return', function () {
            assert.isTrue(integer({ valueOf: () => 1, toString: () => '5000000000' }));
            assert.isTrue(integer({ valueOf: () => 1 }));
            assert.isTrue(integer({ toString: () => '1' }));
            assert.isTrue(integer(Object(1)));
            assert.isTrue(integer(Object('1')));
            assert.isTrue(integer({ [Symbol.toPrimitive]: () => 1 }));
            assert.isTrue(integer(new Date(0)));
        });

        it('does not read the value more than once', function () {
            let reads = 0;
            const value = {
                valueOf() {
                    reads++;
                    return 1;
                },
                toString() {
                    reads++;
                    return '1';
                },
            };
            assert.isTrue(integer(value, { gt: 0 }));
            assert.equal(reads, 0);
        });

        it('still skips an optional value that is absent', function () {
            assert.isFalse(validator.notValid([{ name: 'amount', type: 'integer', value: undefined, optional: true }]));
            assert.throws(
                () => validator.notValid([{ name: 'amount', type: 'integer', value: '1e3', optional: true }]),
                'Invalid amount provided'
            );
        });
    });

    describe("'positive-integer'", function () {
        it('accepts positive numbers, digit strings and bigints', function () {
            assert.isFalse(positive(1)());
            assert.isFalse(positive('1')());
            assert.isFalse(positive(1n)());
        });

        it('throws for zero, negatives and anything that is not an integer value', function () {
            for (const value of [0, -1, '0', '-1', 0n, 1.5, '', '1e3', '0x10', true, [], {}, null, undefined]) {
                assert.throws(positive(value), 'balance must be a positive integer');
            }
            assert.throws(positive({ valueOf: () => 1, toString: () => '5000000000' }), 'balance must be a positive integer');
        });
    });
});

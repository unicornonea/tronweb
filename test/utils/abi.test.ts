import { assert } from 'chai';
import config from '../helpers/config.js';
import tronWebBuilder from '../helpers/tronWebBuilder.js';
import testUtils from '../helpers/testUtils.js';
import diskUtils from '../testcases/src/disk-utils.js';
import { buildFullTypeDefinition } from '../../src/utils/abi.js';
import type { AbiParamsCommon } from '../../src/types/ABI.js';

const { ADDRESS_HEX, ADDRESS_BASE58 } = config;
const { loadTests } = diskUtils;

const { equals, getValues } = testUtils;

describe('TronWeb.utils.abi', function () {
    describe('#decodeParams()', function () {
        it('should decode abi coded params passing types and output', function () {
            const tronWeb = tronWebBuilder.createInstance();
            const types = ['string', 'string', 'uint8', 'bytes32', 'uint256'];
            const output =
                '0x00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000012dc03b7993bad736ad595eb9e3ba51877ac17ecc31d2355f8f270125b9427ece700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011506920446179204e30306220546f6b656e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000035049450000000000000000000000000000000000000000000000000000000000';

            const expected = [
                'Pi Day N00b Token',
                'PIE',
                18,
                '0xdc03b7993bad736ad595eb9e3ba51877ac17ecc31d2355f8f270125b9427ece7',
                0,
            ];

            const result = tronWeb.utils.abi.decodeParams([], types, output);

            for (let i = 0; i < expected.length; i++) {
                assert.equal(result[i], expected[i]);
            }
        });

        it('should decode abi coded params passing names, types and output', function () {
            const tronWeb = tronWebBuilder.createInstance();
            const names = ['Token', 'Graph', 'Qty', 'Bytes', 'Total'];
            const types = ['string', 'string', 'uint8', 'bytes32', 'uint256'];
            const output =
                '0x00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000012dc03b7993bad736ad595eb9e3ba51877ac17ecc31d2355f8f270125b9427ece700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011506920446179204e30306220546f6b656e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000035049450000000000000000000000000000000000000000000000000000000000';

            const expected: Record<string, any> = {
                Token: 'Pi Day N00b Token',
                Graph: 'PIE',
                Qty: 18,
                Bytes: '0xdc03b7993bad736ad595eb9e3ba51877ac17ecc31d2355f8f270125b9427ece7',
                Total: 0,
            };

            const result = tronWeb.utils.abi.decodeParams(names, types, output);
            for (const i in expected) {
                assert.equal(result[i], expected[i]);
            }
        });

        it('should throw if the string does not start with 0x', function () {
            const tronWeb = tronWebBuilder.createInstance();
            const types = ['string', 'string', 'uint8', 'bytes32', 'uint256'];
            const output =
                '00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000012dc03b7993bad736ad595eb9e3ba51877ac17ecc31d2355f8f270125b9427ece700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011506920446179204e30306220546f6b656e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000035049450000000000000000000000000000000000000000000000000000000000';
            assert.throws(() => {
                tronWeb.utils.abi.decodeParams([], types, output);
            }, /^invalid BytesLike value/);
        });

        it('should throw if the output format is wrong', function () {
            const tronWeb = tronWebBuilder.createInstance();
            const types = ['string', 'string', 'uint8', 'bytes32', 'uint256'];
            const output =
                '0x00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000012dc03b7993bad736ad595eb9e3ba51877ac17ecc31d2355f8f270125b9427ece700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011506920446179204e30306220546f6b656e0000000000000000000000000000005049450000000000000000000000000000000000000000000000000000000000';

            assert.throws(() => {
                const result = tronWeb.utils.abi.decodeParams([], types, output);
                throw result[1];
            }, 'overflow');
        });

        it('should throw if the output is invalid', function () {
            const tronWeb = tronWebBuilder.createInstance();
            const types = ['string'];
            const output =
                '0x6630f88f000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046173646600000000000000000000000000000000000000000000000000000000';

            assert.throws(() => {
                tronWeb.utils.abi.decodeParams([], types, output);
            }, 'The encoded string is not valid. Its length must be a multiple of 64.');
        });

        it('should decode if the output is prefixed with the method hash', function () {
            const tronWeb = tronWebBuilder.createInstance();
            const types = ['string'];
            const output =
                '0x6630f88f000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046173646600000000000000000000000000000000000000000000000000000000';

            const result = tronWeb.utils.abi.decodeParams([], types, output, true);
            assert.equal(result, 'asdf');
        });
    });

    describe('#encodeParams()', function () {
        it('should encode abi coded params passing types and values', function () {
            const tronWeb = tronWebBuilder.createInstance();
            const types = ['string', 'string', 'uint8', 'bytes32', 'uint256'];
            const values = [
                'Pi Day N00b Token',
                'PIE',
                18,
                '0xdc03b7993bad736ad595eb9e3ba51877ac17ecc31d2355f8f270125b9427ece7',
                0,
            ];

            const expected =
                '0x00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000012dc03b7993bad736ad595eb9e3ba51877ac17ecc31d2355f8f270125b9427ece700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011506920446179204e30306220546f6b656e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000035049450000000000000000000000000000000000000000000000000000000000';

            const result = tronWeb.utils.abi.encodeParams(types, values);

            for (let i = 0; i < expected.length; i++) {
                assert.equal(result[i], expected[i]);
            }
        });

        it('should encode abi coded params passing addresses in hex and base58 mode', function () {
            const tronWeb = tronWebBuilder.createInstance();
            const types = ['string', 'address', 'address'];
            const values = ['Onwer', ADDRESS_HEX, ADDRESS_BASE58];

            const expected =
                '0x00000000000000000000000000000000000000000000000000000000000000600000000000000000000000007e5f4552091a69125d5dfcb7b8c2659029395bdf0000000000000000000000007e5f4552091a69125d5dfcb7b8c2659029395bdf00000000000000000000000000000000000000000000000000000000000000054f6e776572000000000000000000000000000000000000000000000000000000';
            const result = tronWeb.utils.abi.encodeParams(types, values);

            for (let i = 0; i < expected.length; i++) {
                assert.equal(result[i], expected[i]);
            }
        });
    });

    describe('#encodeParamsV2ByABI()-(v1 input)', function () {
        const tronWeb = tronWebBuilder.createInstance();
        const coder = tronWeb.utils.abi;

        const tests = loadTests('contract-interface');
        tests.forEach((test: any) => {
            const { normalizedValues, result, interface: abi } = test;
            const funcABI = JSON.parse(abi);
            const inputValues = getValues(JSON.parse(normalizedValues));
            funcABI[0].inputs = funcABI[0].outputs;
            const title = test.name + ' => (' + test.types + ') = (' + test.normalizedValues + ')';
            it('encodes parameters - ' + test.name + ' - ' + test.types, function () {
                this.timeout(120000);
                const encoded = coder.encodeParamsV2ByABI(funcABI[0], inputValues);
                assert.equal(encoded, result, 'encoded data - ' + title);
            });
        });
    });

    describe('#encodeParamsV2ByABI()-(v2 input)', function () {
        const tronWeb = tronWebBuilder.createInstance();
        const coder = tronWeb.utils.abi;

        const tests = loadTests('contract-interface-abi2');
        tests.forEach((test: any) => {
            const { values, result, interface: abi } = test;
            const funcABI = JSON.parse(abi);
            const inputValues = getValues(JSON.parse(values));
            funcABI[0].inputs = funcABI[0].outputs;
            const title = test.name + ' => (' + test.types + ') = (' + test.normalizedValues + ')';
            it('encodes parameters - ' + test.name + ' - ' + test.types, function () {
                this.timeout(120000);
                const encoded = coder.encodeParamsV2ByABI(funcABI[0], inputValues);
                assert.equal(encoded, result, 'encoded data - ' + title);
            });
        });
    });

    describe('#buildFunctionSelector()', function () {
        // The client factories build a constant-call function selector as
        // `${fragment.name}(${inputs.map(buildFullTypeDefinition).join(',')})`.
        // buildFunctionSelector itself is a private one-liner duplicated in the
        // client files, so these tests exercise its building block,
        // buildFullTypeDefinition, plus the selector composition it produces.
        function buildFunctionSelector(fragment: { name: string; inputs: ReadonlyArray<AbiParamsCommon> }) {
            return `${fragment.name}(${fragment.inputs.map((input) => buildFullTypeDefinition(input)).join(',')})`;
        }

        it('returns primitive types unchanged', function () {
            assert.equal(buildFullTypeDefinition({ name: 'a', type: 'uint256' }), 'uint256');
            assert.equal(buildFullTypeDefinition({ name: 'b', type: 'address' }), 'address');
            assert.equal(buildFullTypeDefinition({ name: 'c', type: 'bool' }), 'bool');
            assert.equal(buildFullTypeDefinition({ name: 'd', type: 'uint256[]' }), 'uint256[]');
        });

        it('rewrites the trcToken type to uint256', function () {
            assert.equal(buildFullTypeDefinition({ name: 'tokenId', type: 'trcToken' }), 'uint256');
        });

        it('rewrites trcToken arrays to uint256 arrays', function () {
            assert.equal(buildFullTypeDefinition({ name: 'tokenIds', type: 'trcToken[]' }), 'uint256[]');
        });

        it('rewrites a trcToken nested inside a tuple', function () {
            assert.equal(
                buildFullTypeDefinition({
                    name: 'payload',
                    type: 'tuple',
                    components: [
                        { name: 'token', type: 'trcToken' },
                        { name: 'amount', type: 'uint256' },
                    ],
                }),
                '(uint256,uint256)'
            );
        });

        it('expands a flat tuple into the parenthesized form', function () {
            assert.equal(
                buildFullTypeDefinition({
                    name: 'payload',
                    type: 'tuple',
                    components: [
                        { name: 'owner', type: 'address' },
                        { name: 'amount', type: 'uint256' },
                    ],
                }),
                '(address,uint256)'
            );
        });

        it('expands nested tuples recursively', function () {
            assert.equal(
                buildFullTypeDefinition({
                    name: 'payload',
                    type: 'tuple',
                    components: [
                        { name: 'owner', type: 'address' },
                        {
                            name: 'flags',
                            type: 'tuple',
                            components: [
                                { name: 'approver', type: 'address' },
                                { name: 'enabled', type: 'bool' },
                            ],
                        },
                    ],
                }),
                '(address,(address,bool))'
            );
        });

        it('keeps the array suffix when expanding tuple arrays', function () {
            assert.equal(
                buildFullTypeDefinition({
                    name: 'history',
                    type: 'tuple[]',
                    components: [
                        { name: 'account', type: 'address' },
                        { name: 'amount', type: 'uint256' },
                    ],
                }),
                '(address,uint256)[]'
            );
        });

        it('builds a function selector with a trcToken parameter', function () {
            assert.equal(
                buildFunctionSelector({
                    name: 'transferToken',
                    inputs: [
                        { name: 'to', type: 'address' },
                        { name: 'tokenId', type: 'trcToken' },
                        { name: 'amount', type: 'uint256' },
                    ],
                }),
                'transferToken(address,uint256,uint256)'
            );
        });

        it('builds a function selector with nested tuple and trcToken parameters', function () {
            assert.equal(
                buildFunctionSelector({
                    name: 'inspect',
                    inputs: [
                        {
                            name: 'payload',
                            type: 'tuple',
                            components: [
                                { name: 'owner', type: 'address' },
                                { name: 'token', type: 'trcToken' },
                                {
                                    name: 'flags',
                                    type: 'tuple',
                                    components: [
                                        { name: 'approver', type: 'address' },
                                        { name: 'enabled', type: 'bool' },
                                    ],
                                },
                            ],
                        },
                        {
                            name: 'history',
                            type: 'tuple[]',
                            components: [
                                { name: 'account', type: 'address' },
                                { name: 'amount', type: 'uint256' },
                            ],
                        },
                    ],
                }),
                'inspect((address,uint256,(address,bool)),(address,uint256)[])'
            );
        });
    });

    describe('#decodeParamsV2ByABI()-(v1 output)', function () {
        const tronWeb = tronWebBuilder.createInstance();
        const coder = tronWeb.utils.abi;

        const tests = loadTests('contract-interface');
        tests.forEach((test: any) => {
            const { normalizedValues, result, interface: abi } = test;
            const funcABI = JSON.parse(abi);
            const outputValues = getValues(JSON.parse(normalizedValues));
            const title = test.name + ' => (' + test.types + ') = (' + test.normalizedValues + ')';
            it('decodes parameters - ' + test.name + ' - ' + test.types, function () {
                this.timeout(120000);
                const decoded = coder.decodeParamsV2ByABI(funcABI[0], result);
                assert.ok(equals(decoded, outputValues), 'decoded data - ' + title);
            });
        });
    });

    describe('#decodeParamsV2ByABI()-(v2 output)', function () {
        const tronWeb = tronWebBuilder.createInstance();
        const coder = tronWeb.utils.abi;

        const tests = loadTests('contract-interface-abi2');
        tests.forEach((test: any) => {
            const { values, result, interface: abi } = test;
            const funcABI = JSON.parse(abi);
            const outputValues = getValues(JSON.parse(values));
            const title = test.name + ' => (' + test.types + ') = (' + test.normalizedValues + ')';
            it('decodes parameters - ' + test.name + ' - ' + test.types, function () {
                this.timeout(120000);
                const decoded = coder.decodeParamsV2ByABI(funcABI[0], result);
                assert.ok(equals(decoded, outputValues), 'decoded data - ' + title);
            });
        });
    });
});

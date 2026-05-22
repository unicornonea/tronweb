<h1 align="center">
  <a href="https://tronweb.network">
    <img align="center" src="https://raw.githubusercontent.com/tronprotocol/tronweb/master/assets/logo.png"/>
  </a>
</h1>

<p align="center">
  <a href="https://discord.gg/FgvVFQgdCW">
    <img src="https://img.shields.io/badge/chat-on%20discord-brightgreen.svg">
  </a>

  <a href="https://github.com/tronprotocol/tronweb/issues">
    <img src="https://img.shields.io/github/issues/tron-us/tronweb.svg">
  </a>

  <a href="https://github.com/tronprotocol/tronweb/pulls">
    <img src="https://img.shields.io/github/issues-pr/tron-us/tronweb.svg">
  </a>

  <a href="https://github.com/tronprotocol/tronweb/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/tron-us/tronweb.svg">
  </a>

  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/tron-us/tronweb.svg">
  </a>
</p>

## What is TronWeb?

[TronWeb](https://tronweb.network) aims to deliver a unified, seamless development experience for the TRON ecosystem. We have taken the core ideas and expanded upon them to unlock the functionality of TRON's unique feature set along with offering new tools for integrating DApps in the browser, Node.js and IoT devices.

To better support its use in TypeScript projects, we have rewritten the entire library in TypeScript. And to make the TronWeb API more secure and consistent, there are some breaking changes. <font color=red>Please check out [<font color=red>6.x API documentation</font>](https://tronweb.network/docu/docs/intro/)</font> for detailed changes so you can start using the new TypeScript version of TronWeb early. Any questions or feedback are welcome [here](https://github.com/tronprotocol/tronweb/issues/new).

**Project scope**

Any new TRON feature will be incorporated into TronWeb. Changes to the API to improve quality-of-life are in-scope for the project. We are committed to keeping TronWeb up-to-date with the latest developments in the TRON ecosystem while continuously refining the developer experience.

## HomePage

__[tronweb.network](https://tronweb.network)__

## Compatibility
- Version built for Node.js v14 and above
- Version built for browsers with more than 0.25% market share

You can access either version specifically from the dist folder.

TronWeb is also compatible with frontend frameworks such as:
- Angular
- React
- Vue.

You can also ship TronWeb in a Chrome extension.

## Recent History

For recent history, see the [CHANGELOG](https://github.com/tronprotocol/tronweb/blob/master/CHANGELOG.md). You can check it out for:
- New features
- Dependencies update
- Bug fix

## Installation

### Node.js
```bash
npm install tronweb
```
or
```bash
yarn add tronweb
```

### Browser

The easiest way to use TronWeb in a browser is to install it as above and copy the dist file to your working folder. For example:
```
cp node_modules/tronweb/dist/TronWeb.js ./js/tronweb.js
```
so that you can call it in your HTML page as
```
<script src="./js/tronweb.js"><script>
```

This project is also published on NPM and you can access CDN mirrors of this release (please use sub-resource integrity for any `<script>` includes).

## Testnet

Shasta is the official Tron testnet. To use it use the following endpoint:
```
https://api.shasta.trongrid.io
```
Get some Shasta TRX at https://www.trongrid.io/shasta and play with it.
Anything you do should be explorable on https://shasta.tronscan.org

## Your local private network for heavy testing

You can set up a local private TRON network using the **TRON Runtime Environment (TRE)**. This is a Docker-based local blockchain runtime that provides a full TRON network for development, testing, and automation.

To do it you must [install Docker](https://docs.docker.com/install/) and, when ready, run a command like

```bash
docker run -it -p 9090:9090 --rm --name tron tronbox/tre:dev
```

Once running, the local node will be available at: http://localhost:9090

[More details about TRE](https://hub.docker.com/r/tronbox/tre)

## Creating an Instance

First of all, in your typescript file, define TronWeb:

```typescript
import { TronWeb, utils as TronWebUtils, Trx, TransactionBuilder, Contract, Event, Plugin } from 'tronweb';
```

Please note that this is not the same as v5.x. If you want to dive into more differences, check out [migration guide](https://tronweb.network/docu/docs/Migrating%20from%20v5)

When you instantiate TronWeb you can define

* fullNode
* solidityNode
* eventServer
* privateKey

you can also set a

* fullHost

which works as a jolly. If you do so, though, the more precise specification has priority.
Supposing you are using a server which provides everything, like TronGrid, you can instantiate TronWeb as:

```js
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { "TRON-PRO-API-KEY": 'your api key' },
    privateKey: 'your private key'
})
```

For retro-compatibility, though, you can continue to use the old approach, where any parameter is passed separately:
```js
const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey)
tronWeb.setHeader({ "TRON-PRO-API-KEY": 'your api key' });
```

If you are, for example, using a server as full and solidity node, and another server for the events, you can set it as:

```js
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    eventServer: 'https://api.someotherevent.io',
    privateKey: 'your private key'
  }
)
```

If you are using different servers for anything, you can do
```js
const tronWeb = new TronWeb({
    fullNode: 'https://some-node.tld',
    solidityNode: 'https://some-other-node.tld',
    eventServer: 'https://some-event-server.tld',
    privateKey: 'your private key'
  }
)
```

### Viem-Style Account, Client & Contract Factories

If you prefer a factory-based workflow, TronWeb also supports additive account, client, and contract factories. This does not replace any existing `new TronWeb(...)` usage.

For the current full compatibility summary, see `TRONWEB_VIEM_FULL_ALIGNMENT_COMPARISON.md`.

#### Account abstraction

`privateKeyToAccount('0x...')` returns a local account object that can be passed directly into `createWalletClient(...)`.

The returned account exposes:

- `address`
- `publicKey`
- `type`
- `source`
- `sign({ hash })`
- `signMessage({ message })`
- `signTransaction(transaction)`
- `signTypedData({ domain, types, primaryType, message })`

The private key stays encapsulated and is never exposed on the returned object.

```ts
import { privateKeyToAccount } from 'tronweb'

const account = privateKeyToAccount('0xyour-private-key')

const signature = await account.signMessage({
  message: 'hello tron',
})
```

Recover helpers remain on existing TronWeb utilities instead of being duplicated on the account object:

- `utils.message.verifyMessage(...)`
- `utils.typedData.verifyTypedData(...)`
- `utils.crypto.ecRecover(...)`
- `Trx.verifyTypedData(...)`
- `Trx.ecRecover(...)`

#### Client factories

Current built-in chains are available from `tronweb/chains`:

- `mainnet` -> chainId `728126428` -> `https://api.trongrid.io`
- `nile` -> chainId `3448148188` -> `https://nile.trongrid.io`
- `shasta` -> chainId `2494104990` -> `https://api.shasta.trongrid.io`

Currently, `http()` is the only supported transport. The transport layer is kept separate so more transports can be added later without breaking existing TronWeb APIs.
The `chain.id` field stores the numeric chainId.

Both `createPublicClient(...)` and `createWalletClient(...)` expose client metadata (`key`, `name`, `type`, `uid`) along with `chain`, `transport`, `trx`, and `transactionBuilder`.

```ts
import { createPublicClient, http } from 'tronweb'
import { mainnet } from 'tronweb/chains'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

const chainId = await publicClient.getChainId()
const blockNumber = await publicClient.getBlockNumber()
const block = await publicClient.getBlock({ blockTag: 'latest' })
```

Current top-level public client helpers:

- `getAccount`
- `getBalance`
- `getBlock`
- `getBlockByHash`
- `getBlockByNumber`
- `getBlockTransactionCount`
- `getChainId`
- `getBlockNumber`
- `getTransaction`
- `getTransactionInfo`
- `getTransactionReceipt`
- `waitForTransactionReceipt`
- `call`
- `readContract`
- `estimateContractGas`
- `getLogs`
- `getContractEvents`
- `verifyMessage`
- `verifyTypedData`

These top-level helpers support both the current scalar form and an object-style form where it makes sense.

Examples:

- `client.getBlock('latest')`
- `client.getBlock({ blockTag: 'latest' })`
- `client.getBalance('T...')`
- `client.getBalance({ address: 'T...' })`
- `client.getTransaction('txid')`
- `client.getTransaction({ hash: 'txid' })`

You can still override the default endpoint explicitly:

```ts
import { createPublicClient, http } from 'tronweb'
import { mainnet } from 'tronweb/chains'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://your-custom-node.tld'),
})
```

If you need a custom chain definition, you can keep the same style and define one without affecting the legacy TronWeb constructor flow:

```ts
import { createPublicClient, defineChain, http } from 'tronweb'

const privateChain = defineChain({
  id: 728126428,
  name: 'Private TRON Mainnet Mirror',
  network: 'mainnet',
  nativeCurrency: {
    name: 'TRON',
    symbol: 'TRX',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ['https://private.trongrid.local'],
    },
  },
})

const publicClient = createPublicClient({
  chain: privateChain,
  transport: http(),
})
```

#### Wallet client helpers

`createWalletClient(...)` extends the read/query surface with top-level wallet actions.

```ts
import { createWalletClient, http, privateKeyToAccount } from 'tronweb'
import { nile } from 'tronweb/chains'

const account = privateKeyToAccount('0xyour-private-key')

const walletClient = createWalletClient({
  account,
  chain: nile,
  transport: http(),
})

const addresses = await walletClient.getAddresses()
const balance = await walletClient.getBalance({ address: account.address })
```

Current top-level wallet helpers:

- `getAddresses`
- `requestAddresses`
- `sendRawTransaction`
- `signMessage`
- `signTransaction`
- `signTypedData`
- `writeContract`
- `deployContract`
- `sendTransaction`

`walletClient.signMessage()` uses TRON `signMessageV2` semantics. It does not fall back to the legacy `trx.signMessage` v1 behavior.

`sendTransaction(...)` keeps a TRON-native shape:

```ts
const result = await walletClient.sendTransaction({
  type: 'sendTrx',
  parameters: ['TXx...toAddress', 1_000_000, account.address],
})
```

`writeContract(...)` and `deployContract(...)` accept object-style parameters and keep TRON-specific fields such as `feeLimit`, `tokenId`, `tokenValue`, and `permissionId`.

#### Contract abstraction

`getContract({ client, abi, address })` is now the canonical contract wrapper entry on top of either a public client or a wallet client.

`createContract(...)` is still exported as a backward-compatible alias.

The returned contract currently exposes:

- `address`
- `abi`
- `read.*`
- `estimateGas.*`
- `getEvents.*`
- `write.*` when the client is a wallet client

Most flat ABI methods are also preserved as a compatibility layer when their names do not collide with reserved contract keys.

```ts
import {
  getContract,
  createWalletClient,
  http,
  privateKeyToAccount,
} from 'tronweb'
import { mainnet } from 'tronweb/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0xyour-private-key'),
  chain: mainnet,
  transport: http(),
})

const contract = getContract({
  client,
  abi: MyAbi,
  address: 'TXx...',
})

const balance = await contract.read.balanceOf(['TXx...owner'])
const gas = await contract.estimateGas.transfer(['TXx...to', 1000n])
const txId = await contract.write.transfer(['TXx...to', 1000n], {
  feeLimit: 150_000_000,
})
const events = await contract.getEvents.Transfer({ to: 'TXx...to' }, {
  onlyConfirmed: true,
  limit: 10,
})
```

The flat compatibility layer still works for most ABI method names:

```ts
const balance = await contract.balanceOf('TXx...owner')
const txId = await contract.transfer('TXx...to', 1000n)
```

Reserved contract instance keys are:

- `address`
- `abi`
- `read`
- `write`
- `estimateGas`
- `getEvents`

If an ABI method collides with one of these keys, use the namespaced API instead of the flat compatibility layer.

#### Coming from viem

If you are already used to viem, the closest TronWeb patterns look like this.

Action-style contract calls:

```ts
// viem
const balance = await publicClient.readContract({
  address: contractAddress,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [ownerAddress],
})

const hash = await walletClient.writeContract({
  address: contractAddress,
  abi: ERC20_ABI,
  functionName: 'transfer',
  args: [recipientAddress, parseUnits('1', 6)],
  account,
})

// tronweb
const balance = await publicClient.readContract({
  address: contractAddress,
  abi: TRC20_ABI,
  functionName: 'balanceOf',
  args: [ownerAddress],
})

const txId = await walletClient.writeContract({
  address: contractAddress,
  abi: TRC20_ABI,
  functionName: 'transfer',
  args: [recipientAddress, 1_000_000n],
  account: account.address,
  feeLimit: 100_000_000,
})
```

Contract instance style:

```ts
// viem
const contract = getContract({
  address: contractAddress,
  abi: ERC20_ABI,
  client: {
    public: publicClient,
    wallet: walletClient,
  },
})

const balance = await contract.read.balanceOf([ownerAddress])
const hash = await contract.write.transfer(
  [recipientAddress, parseUnits('1', 6)],
  { account },
)

// tronweb
const contract = getContract({
  client: walletClient,
  abi: TRC20_ABI,
  address: contractAddress,
})

const balance = await contract.read.balanceOf([ownerAddress])
const txId = await contract.write.transfer(
  [recipientAddress, 1_000_000n],
  {
    account: account.address,
    feeLimit: 100_000_000,
  },
)
```

Message signing and verification:

```ts
// viem
const signature = await walletClient.signMessage({
  message: 'hello world',
})

const isValid = await publicClient.verifyMessage({
  address: account.address,
  message: 'hello world',
  signature,
})

// tronweb
const signature = await walletClient.signMessage({
  message: 'hello tron',
})

const isValid = await publicClient.verifyMessage({
  address: account.address,
  message: 'hello tron',
  signature,
})
```

The most important differences to remember are:

- TronWeb contract and account addresses are usually TRON base58Check addresses instead of EVM `0x...` addresses.
- `walletClient.writeContract(...)` returns a TRON `txId`.
- TronWeb keeps TRON-native write options such as `feeLimit`, `value`, `tokenId`, `tokenValue`, and `permissionId`.
- `walletClient.signMessage(...)` uses TRON `signMessageV2` semantics.
- If you pass `account` into TronWeb `writeContract(...)`, it must match the account configured on the wallet client.

## FAQ

1. Cannot destructure property 'Transaction' of 'globalThis.TronWebProto' as it is undefined.

This is a problem caused by webpack as it doesn't load cjs file correctly. To solve this problem, you need to add a new rule like below:
```
{
      test: /\.cjs$/,
      type: 'javascript/auto'
}
```

For more questions, please refer to [TronWeb Doc](https://tronweb.network/docu/docs/Migrating%20from%20v5#faq).

## Integrity Check

The package files will be signed using a GPG key pair, and the correctness of the signature will be verified using the following public key:

```
pub: 4371 AB85 E5A5 8FAA 88AD 7FDF 9945 DBCA 8C4B B810
uid: dev@tronweb.network
```

## Contributions

In order to contribute you can

* fork this repo and clone it locally
* install the dependencies — `npm i`
* do your changes to the code
* build the TronWeb dist files — `npm run build:all`
* run a local private network using Tron Quickstart
* run the tests — `npm run test`
* push your changes and open a pull request

Contact the team at https://cn.developers.tron.network/docs/online-technical-support


## Licence

TronWeb is distributed under a MIT licence.



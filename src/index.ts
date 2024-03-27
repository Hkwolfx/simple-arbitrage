import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { Contract, providers, Wallet } from "ethers";
import { BUNDLE_EXECUTOR_ABI } from "./abi";
import { UniswappyV2EthPair } from "./UniswappyV2EthPair";
import { FACTORY_ADDRESSES } from "./addresses";
import { Arbitrage } from "./Arbitrage";
import { ethers } from 'ethers';
import { get } from "https"
import { getDefaultRelaySigningKey } from "./utils";
import dotenv from 'dotenv';

dotenv.config();



const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545"
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xcdb1f29acb2b04ad3dee3949321bb8fc3d92ceae4f979bc631480c478973bacb"
const BUNDLE_EXECUTOR_ADDRESS = process.env.BUNDLE_EXECUTOR_ADDRESS || "0x85abad0c96e3aff7a7ff4d95df906f4818cff38b"

const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY || getDefaultRelaySigningKey();

function isHex(h: string) {
  const regexp = /^[0-9a-fA-F]{64}$/;
  return regexp.test(h);
}


if (PRIVATE_KEY !== "") {
  const message = isHex(PRIVATE_KEY) ? 'Private key is valid, Welcome Commander' : 'Private key is invalid';
  console.log(message);
  console.log(process.env.PRIVATE_KEY);
  console.log(process.env.FLASHBOTS_RELAY_SIGNING_KEY);
  console.log(process.env.BUNDLE_EXECUTOR_ADDRESS);
  console.log(process.env.ETHEREUM_RPC_URL);
} else {
  console.log('Value is undefined');
}


const MINER_REWARD_PERCENTAGE = parseInt(process.env.MINER_REWARD_PERCENTAGE || "80")

if (PRIVATE_KEY === "") {
  console.warn("Must provide PRIVATE_KEY environment variable")
  process.exit(1)
}
if (BUNDLE_EXECUTOR_ADDRESS === "") {
  console.warn("Must provide BUNDLE_EXECUTOR_ADDRESS environment variable. Please see README.md")
  process.exit(1)
}

if (FLASHBOTS_RELAY_SIGNING_KEY === "") {
  console.warn("Must provide FLASHBOTS_RELAY_SIGNING_KEY. Please see https://github.com/flashbots/pm/blob/main/guides/searcher-onboarding.md")
  process.exit(1)
}

const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || ""

const provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL); // replace with your provider

// Generate a new private key
const newWallet = ethers.Wallet.createRandom();
console.log('New private key:', newWallet.privateKey);

const arbitrageSigningWallet = new Wallet(newWallet.privateKey, provider);
const flashbotsRelaySigningWallet = new Wallet(newWallet.privateKey, provider);

function healthcheck() {
  if (HEALTHCHECK_URL === "") {
    return
  }
  get(HEALTHCHECK_URL).on('error', console.error);
}

async function main() {
  console.log("Searcher Wallet Address: " + await arbitrageSigningWallet.getAddress())
  console.log("Flashbots Relay Signing Wallet Address: " + await flashbotsRelaySigningWallet.getAddress())
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, flashbotsRelaySigningWallet);
  const arbitrage = new Arbitrage(
    arbitrageSigningWallet,
    flashbotsProvider,
    new Contract(BUNDLE_EXECUTOR_ADDRESS, BUNDLE_EXECUTOR_ABI, provider) )

  const markets = await UniswappyV2EthPair.getUniswapMarketsByToken(provider, FACTORY_ADDRESSES);
  provider.on('block', async (blockNumber) => {
    await UniswappyV2EthPair.updateReserves(provider, markets.allMarketPairs);
    const bestCrossedMarkets = await arbitrage.evaluateMarkets(markets.marketsByToken);
    if (bestCrossedMarkets.length === 0) {
      console.log("No crossed markets")
      return
    }
    bestCrossedMarkets.forEach(Arbitrage.printCrossedMarket);
    arbitrage.takeCrossedMarkets(bestCrossedMarkets, blockNumber, MINER_REWARD_PERCENTAGE).then(healthcheck).catch(console.error)
  })
}

main();

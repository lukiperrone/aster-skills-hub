#!/usr/bin/env bun
/**
 * Wallet token balances for Aster deposit–supported assets. Uses Aster assets endpoint + viem.
 * Env: optional ASTER_DEPOSIT_PRIVATE_KEY (to derive address); or pass --address. Optional: ETH_RPC_URL, BSC_RPC_URL, ARBITRUM_RPC_URL.
 * Usage: bun run balance.mjs --chain <eth|bsc|arbitrum> [--address <0x...>]
 */

import { createPublicClient, http, getAddress, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, getAssets, getRpcUrl, ERC20_BALANCE_ABI } from "./common.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--chain" && args[i + 1]) out.chain = args[++i].toLowerCase();
    else if (args[i] === "--address" && args[i + 1]) out.address = args[++i];
  }
  return out;
}

function main() {
  const { chain, address: cliAddress } = parseArgs();
  if (!chain) {
    console.error("Usage: bun run balance.mjs --chain <eth|bsc|arbitrum> [--address <0x...>]");
    process.exit(1);
  }

  const chainConf = CHAINS[chain];
  if (!chainConf) {
    console.error("Invalid chain. Use: eth, bsc, arbitrum");
    process.exit(1);
  }

  let walletAddress = cliAddress;
  if (!walletAddress) {
    const key = process.env.ASTER_DEPOSIT_PRIVATE_KEY;
    if (!key || !key.startsWith("0x")) {
      console.error("Set ASTER_DEPOSIT_PRIVATE_KEY in env or pass --address <0x...>");
      process.exit(1);
    }
    walletAddress = privateKeyToAccount(key).address;
  }
  walletAddress = getAddress(walletAddress);

  const publicClient = createPublicClient({
    chain: chainConf.chain,
    transport: http(getRpcUrl(chainConf)),
  });

  (async () => {
    const assets = await getAssets(chainConf.chainId);
    if (!assets.length) {
      console.log("No assets returned for chain", chain);
      return;
    }

    const nativeDecimals = chainConf.chain.nativeCurrency?.decimals ?? 18;
    const nativeBalance = await publicClient.getBalance({ address: walletAddress });

    const erc20Assets = assets.filter((a) => !a.isNative);
    const erc20Balances =
      erc20Assets.length > 0
        ? await publicClient.readContracts({
            contracts: erc20Assets.map((a) => ({
              address: getAddress(a.contractAddress),
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [walletAddress],
            })),
          })
        : [];

    console.log("Chain:", chain, "| Address:", walletAddress, "\n");
    console.log("Asset".padEnd(12), "Balance (raw)".padEnd(24), "Balance");
    console.log("-".repeat(52));

    for (const a of assets) {
      if (a.isNative) {
        const raw = nativeBalance.toString();
        const human = formatUnits(nativeBalance, nativeDecimals);
        console.log(String(a.name).padEnd(12), raw.padEnd(24), human);
      } else {
        const idx = erc20Assets.findIndex((e) => e.contractAddress === a.contractAddress);
        const result = erc20Balances[idx];
        const raw = result?.status === "success" ? result.result.toString() : "?";
        const decimals = Number(a.decimals) ?? 18;
        const human = result?.status === "success" ? formatUnits(result.result, decimals) : "?";
        console.log(String(a.name).padEnd(12), raw.padEnd(24), human);
      }
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

#!/usr/bin/env bun
/**
 * Deposit funds to Aster. Uses viem. Run with Bun.
 * Env: ASTER_DEPOSIT_PRIVATE_KEY (required); optional: ETH_RPC_URL, BSC_RPC_URL, ARBITRUM_RPC_URL.
 * Usage: bun run deposit.mjs --chain <eth|bsc|arbitrum> --asset <SYMBOL> --amount <human amount> [--broker <uint256>] [--dry-run]
 */

import { createWalletClient, createPublicClient, http, parseUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, getAssets, getDepositAddress, getRpcUrl, ERC20_ABI, TREASURY_ABI } from "./common.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { broker: 1n, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--chain" && args[i + 1]) out.chain = args[++i].toLowerCase();
    else if (args[i] === "--asset" && args[i + 1]) out.asset = args[++i].toUpperCase();
    else if (args[i] === "--amount" && args[i + 1]) out.amount = args[++i];
    else if (args[i] === "--broker" && args[i + 1]) out.broker = BigInt(args[++i]);
    else if (args[i] === "--dry-run") out.dryRun = true;
  }
  return out;
}

function main() {
  const { chain, asset, amount, broker, dryRun } = parseArgs();
  if (!chain || !asset || !amount) {
    console.error("Usage: bun run deposit.mjs --chain <eth|bsc|arbitrum> --asset <SYMBOL> --amount <human amount> [--broker <uint256>] [--dry-run]");
    process.exit(1);
  }

  const chainConf = CHAINS[chain];
  if (!chainConf) {
    console.error("Invalid chain. Use: eth, bsc, arbitrum");
    process.exit(1);
  }

  if (!dryRun) {
    const key = process.env.ASTER_DEPOSIT_PRIVATE_KEY;
    if (!key || !key.startsWith("0x")) {
      console.error("Set ASTER_DEPOSIT_PRIVATE_KEY (hex) in env.");
      process.exit(1);
    }
  }

  const rpcUrl = getRpcUrl(chainConf);
  const account = dryRun ? null : privateKeyToAccount(process.env.ASTER_DEPOSIT_PRIVATE_KEY);

  const publicClient = dryRun ? null : createPublicClient({ chain: chainConf.chain, transport: http(rpcUrl) });
  const walletClient = dryRun ? null : createWalletClient({ account, chain: chainConf.chain, transport: http(rpcUrl) });

  (async () => {
    const assets = await getAssets(chainConf.chainId);
    const item = assets.find((a) => a.name === asset);
    if (!item) {
      console.error(`Asset "${asset}" not found for chain ${chain}. Available: ${assets.map((a) => a.name).join(", ")}`);
      process.exit(1);
    }

    const depositAddress = await getDepositAddress(chainConf.chainId);
    const decimals = Number(item.decimals) || 18;
    const decimalsForAmount = item.isNative ? (chainConf.chain.nativeCurrency?.decimals ?? 18) : decimals;
    const amountRaw = parseUnits(amount, decimalsForAmount);

    if (dryRun) {
      console.log("DRY RUN — no transactions will be sent.\n");
      console.log("Chain:", chain, "| Asset:", asset, "| Amount:", amount, "| Broker:", broker.toString());
      console.log("Treasury (deposit address):", depositAddress);
      console.log("Amount (raw):", amountRaw.toString());
      if (item.isNative) {
        console.log("\nWould call: treasury.depositNative(" + broker + ") with value:", amountRaw.toString());
      } else {
        const tokenAddress = getAddress(item.contractAddress);
        console.log("Token:", tokenAddress);
        console.log("\nWould send:");
        console.log("  1. token.approve(" + depositAddress + ", " + amountRaw + ")");
        console.log("  2. treasury.deposit(" + tokenAddress + ", " + amountRaw + ", " + broker + ")");
      }
      return;
    }

    if (item.isNative) {
      const hash = await walletClient.writeContract({
        address: depositAddress,
        abi: TREASURY_ABI,
        functionName: "depositNative",
        args: [broker],
        value: amountRaw,
      });
      console.log("Native deposit tx:", hash);
      await publicClient.waitForTransactionReceipt({ hash });
      console.log("Deposit complete.");
      return;
    }

    const tokenAddress = getAddress(item.contractAddress);
    const approveHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [depositAddress, amountRaw],
    });
    console.log("Approve tx:", approveHash);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    const depositHash = await walletClient.writeContract({
      address: depositAddress,
      abi: TREASURY_ABI,
      functionName: "deposit",
      args: [tokenAddress, amountRaw, broker],
    });
    console.log("Deposit tx:", depositHash);
    await publicClient.waitForTransactionReceipt({ hash: depositHash });
    console.log("Deposit complete.");
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

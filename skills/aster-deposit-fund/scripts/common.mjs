/**
 * Shared config, BAPI helpers, and ABIs for Aster deposit scripts.
 */

import { getAddress } from "viem";
import { mainnet, bsc, arbitrum } from "viem/chains";

export const BAPI_BASE = "https://www.asterdex.com/bapi/futures/v1/public/future";

export const CHAINS = {
  eth: { chainId: 1, chain: mainnet, rpcEnv: "ETH_RPC_URL", defaultRpc: "https://ethereum-rpc.publicnode.com" },
  bsc: { chainId: 56, chain: bsc, rpcEnv: "BSC_RPC_URL", defaultRpc: "https://bsc-rpc.publicnode.com" },
  arbitrum: { chainId: 42161, chain: arbitrum, rpcEnv: "ARBITRUM_RPC_URL", defaultRpc: "https://arbitrum-one-rpc.publicnode.com" },
};

export const ERC20_ABI = [
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
];

export const ERC20_BALANCE_ABI = [
  { name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];

export const TREASURY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "currency", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "broker", type: "uint256" },
    ],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "broker", type: "uint256" }],
    name: "depositNative",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
];

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const json = await res.json();
  if (json.code !== "000000" && json.success !== true) throw new Error(json.messageDetail || json.message || "API error");
  return json;
}

export async function getAssets(chainId) {
  const url = `${BAPI_BASE}/aster/withdraw/assets?chainIds=${chainId}&networks=EVM&accountType=perp`;
  const json = await fetchJson(url);
  return json.data || [];
}

export async function getDepositAddress(chainId) {
  const url = `${BAPI_BASE}/web3/ae/deposit-address?chainId=${chainId}`;
  const json = await fetchJson(url);
  const addr = json.data;
  if (!addr || typeof addr !== "string") throw new Error("Missing deposit address");
  return getAddress(addr);
}

export function getRpcUrl(chainConf) {
  return process.env[chainConf.rpcEnv] || chainConf.defaultRpc;
}

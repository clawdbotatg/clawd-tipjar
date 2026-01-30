"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import {
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useScaffoldEventHistory,
} from "~~/hooks/scaffold-eth";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";

const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
const BASE_CHAIN_ID = 8453;
const PRESETS = [
  { label: "100", value: "100" },
  { label: "1K", value: "1000" },
  { label: "10K", value: "10000" },
  { label: "100K", value: "100000" },
];

const ERC20_ABI = [
  {
    type: "function" as const,
    name: "approve",
    inputs: [
      { name: "spender", type: "address" as const },
      { name: "amount", type: "uint256" as const },
    ],
    outputs: [{ name: "", type: "bool" as const }],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "function" as const,
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" as const },
      { name: "spender", type: "address" as const },
    ],
    outputs: [{ name: "", type: "uint256" as const }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" as const }],
    outputs: [{ name: "", type: "uint256" as const }],
    stateMutability: "view" as const,
  },
] as const;

export default function TipJarPage() {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [tipAmount, setTipAmount] = useState("");
  const [clawdPrice, setClawdPrice] = useState<number | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isTipping, setIsTipping] = useState(false);
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();

  const wrongNetwork = chainId !== BASE_CHAIN_ID;

  // --- Fetch CLAWD price from DexScreener ---
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CLAWD_TOKEN}`);
        const data = await res.json();
        if (data.pairs && data.pairs.length > 0) {
          setClawdPrice(parseFloat(data.pairs[0].priceUsd));
        }
      } catch (e) {
        console.error("Failed to fetch CLAWD price:", e);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // --- Read TipJar contract data ---
  const { data: tipJarAddress } = useScaffoldReadContract({
    contractName: "ClawdTipJar",
    functionName: "devWallet",
  });

  // Get tipjar contract address from deployed contracts
  const { data: totalTipped } = useScaffoldReadContract({
    contractName: "ClawdTipJar",
    functionName: "totalTipped",
  });

  const { data: totalBurned } = useScaffoldReadContract({
    contractName: "ClawdTipJar",
    functionName: "totalBurned",
  });

  const { data: tipCount } = useScaffoldReadContract({
    contractName: "ClawdTipJar",
    functionName: "tipCount",
  });

  const { data: devShareBps } = useScaffoldReadContract({
    contractName: "ClawdTipJar",
    functionName: "devShareBps",
  });

  const { data: topTippersData } = useScaffoldReadContract({
    contractName: "ClawdTipJar",
    functionName: "getTopTippers",
    args: [10n],
  });

  // --- Read user's CLAWD balance & allowance ---
  // We need the tipjar's deployed address for allowance check
  // Get it from the deployedContracts
  const [tipJarContractAddress, setTipJarContractAddress] = useState<string>("");

  useEffect(() => {
    // Dynamic import of deployed contracts to get address
    import("~~/contracts/deployedContracts").then((mod) => {
      const contracts = mod.default;
      // Try Base (8453) first, then foundry (31337)
      const baseContracts = (contracts as any)?.[8453]?.ClawdTipJar?.address ||
        (contracts as any)?.[31337]?.ClawdTipJar?.address;
      if (baseContracts) {
        setTipJarContractAddress(baseContracts);
      }
    });
  }, []);

  const { data: userBalance } = useReadContract({
    address: CLAWD_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: !!connectedAddress },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CLAWD_TOKEN,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: connectedAddress && tipJarContractAddress
      ? [connectedAddress, tipJarContractAddress as `0x${string}`]
      : undefined,
    query: { enabled: !!connectedAddress && !!tipJarContractAddress },
  });

  // --- Wait for approve tx confirmation ---
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  useEffect(() => {
    if (approveConfirmed) {
      refetchAllowance();
      setApproveTxHash(undefined);
    }
  }, [approveConfirmed, refetchAllowance]);

  // --- Write contracts ---
  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeTip } = useScaffoldWriteContract("ClawdTipJar");

  // --- Event history for recent tips ---
  const { data: tipEvents } = useScaffoldEventHistory({
    contractName: "ClawdTipJar",
    eventName: "TipReceived",
    fromBlock: 0n,
    watch: true,
  });

  // --- Computed values ---
  const parsedAmount = tipAmount ? parseUnits(tipAmount, 18) : 0n;
  const needsApproval = parsedAmount > 0n && (!allowance || allowance < parsedAmount);

  const formatClawd = (val: bigint | undefined) => {
    if (!val) return "0";
    const num = parseFloat(formatUnits(val, 18));
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  const usdValue = (clawdAmount: string) => {
    if (!clawdPrice || !clawdAmount || clawdAmount === "0") return null;
    const usd = parseFloat(clawdAmount) * clawdPrice;
    if (usd < 0.01) return "<$0.01";
    return `$${usd.toFixed(2)}`;
  };

  const usdValueBigInt = (val: bigint | undefined) => {
    if (!val || !clawdPrice) return null;
    const num = parseFloat(formatUnits(val, 18));
    const usd = num * clawdPrice;
    if (usd < 0.01) return "<$0.01";
    return `$${usd.toFixed(2)}`;
  };

  // --- Handlers ---
  const handleSwitchNetwork = useCallback(async () => {
    setIsSwitching(true);
    try {
      await switchChain({ chainId: BASE_CHAIN_ID });
    } catch (e) {
      console.error(e);
      notification.error("Failed to switch network");
    } finally {
      setIsSwitching(false);
    }
  }, [switchChain]);

  const handleApprove = useCallback(async () => {
    if (!parsedAmount || !tipJarContractAddress) return;
    setIsApproving(true);
    try {
      // Approve exact amount + 1% buffer for rounding
      const approveAmount = parsedAmount + (parsedAmount / 100n);
      const hash = await writeApprove({
        address: CLAWD_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [tipJarContractAddress as `0x${string}`, approveAmount],
      });
      setApproveTxHash(hash);
      notification.success("Approval submitted!");
    } catch (e: any) {
      console.error(e);
      notification.error("Approval failed");
    } finally {
      setIsApproving(false);
    }
  }, [parsedAmount, tipJarContractAddress, writeApprove]);

  const handleTip = useCallback(async () => {
    if (!parsedAmount) return;
    setIsTipping(true);
    try {
      await writeTip({
        functionName: "tip",
        args: [parsedAmount],
      });
      notification.success(`Tipped ${tipAmount} CLAWD! 🔥`);
      setTipAmount("");
      refetchAllowance();
    } catch (e: any) {
      console.error(e);
      notification.error("Tip failed");
    } finally {
      setIsTipping(false);
    }
  }, [parsedAmount, tipAmount, writeTip, refetchAllowance]);

  // --- Top tippers ---
  const topAddresses = topTippersData ? topTippersData[0] : [];
  const topAmounts = topTippersData ? topTippersData[1] : [];

  // --- Recent tips from events ---
  const recentTips = tipEvents
    ? [...tipEvents].reverse().slice(0, 10)
    : [];

  return (
    <div className="flex flex-col items-center pt-8 pb-20 px-4">
      {/* Stats Bar */}
      <div className="w-full max-w-3xl grid grid-cols-3 gap-4 mb-8">
        <div className="bg-base-200 rounded-xl p-4 text-center">
          <div className="text-sm opacity-60">Total Tipped</div>
          <div className="text-2xl font-bold">{formatClawd(totalTipped)}</div>
          <div className="text-xs opacity-50">{usdValueBigInt(totalTipped)}</div>
        </div>
        <div className="bg-base-200 rounded-xl p-4 text-center">
          <div className="text-sm opacity-60">🔥 Total Burned</div>
          <div className="text-2xl font-bold text-error">{formatClawd(totalBurned)}</div>
          <div className="text-xs opacity-50">{usdValueBigInt(totalBurned)}</div>
        </div>
        <div className="bg-base-200 rounded-xl p-4 text-center">
          <div className="text-sm opacity-60">Tips Count</div>
          <div className="text-2xl font-bold">{tipCount?.toString() || "0"}</div>
        </div>
      </div>

      {/* Tip Card */}
      <div className="bg-base-100 shadow-xl rounded-2xl p-6 w-full max-w-md mb-8 border border-base-300">
        <h2 className="text-xl font-bold mb-4 text-center">🦞 Tip CLAWD</h2>

        {/* User Balance */}
        {connectedAddress && userBalance !== undefined && (
          <div className="text-center mb-4 text-sm opacity-70">
            Your balance: <span className="font-bold">{formatClawd(userBalance)} CLAWD</span>
            {usdValueBigInt(userBalance) && (
              <span className="ml-1 opacity-50">({usdValueBigInt(userBalance)})</span>
            )}
          </div>
        )}

        {/* Preset Amounts */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              className={`btn btn-sm ${tipAmount === p.value ? "btn-primary" : "btn-outline"}`}
              onClick={() => setTipAmount(p.value)}
            >
              <div className="flex flex-col items-center">
                <span>{p.label}</span>
                {clawdPrice && (
                  <span className="text-[10px] opacity-60">{usdValue(p.value)}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Custom Amount */}
        <div className="form-control mb-4">
          <label className="label">
            <span className="label-text">Custom amount</span>
          </label>
          <div className="relative">
            <input
              type="number"
              placeholder="Enter CLAWD amount"
              className="input input-bordered w-full pr-20"
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              min="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-50">CLAWD</span>
          </div>
          {tipAmount && clawdPrice && (
            <label className="label">
              <span className="label-text-alt">≈ {usdValue(tipAmount)} USD</span>
            </label>
          )}
        </div>

        {/* Split Info */}
        {tipAmount && parsedAmount > 0n && (
          <div className="text-sm opacity-70 mb-4 text-center bg-base-200 rounded-lg p-2">
            <div>
              👨‍💻 Dev gets: {formatClawd((parsedAmount * (devShareBps || 5000n)) / 10000n)} CLAWD
              {usdValue(
                (parseFloat(tipAmount) * Number(devShareBps || 5000n) / 10000).toString()
              ) && (
                <span className="opacity-50 ml-1">
                  ({usdValue((parseFloat(tipAmount) * Number(devShareBps || 5000n) / 10000).toString())})
                </span>
              )}
            </div>
            <div>
              🔥 Burned: {formatClawd(parsedAmount - (parsedAmount * (devShareBps || 5000n)) / 10000n)} CLAWD
              {usdValue(
                (parseFloat(tipAmount) * (10000 - Number(devShareBps || 5000n)) / 10000).toString()
              ) && (
                <span className="opacity-50 ml-1">
                  ({usdValue((parseFloat(tipAmount) * (10000 - Number(devShareBps || 5000n)) / 10000).toString())})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action Button — Switch / Approve / Tip */}
        {!connectedAddress ? (
          <div className="text-center opacity-50 py-2">Connect your wallet to tip</div>
        ) : wrongNetwork ? (
          <button
            className="btn btn-warning w-full"
            disabled={isSwitching}
            onClick={handleSwitchNetwork}
          >
            {isSwitching ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : null}
            {isSwitching ? "Switching..." : "Switch to Base"}
          </button>
        ) : needsApproval ? (
          <button
            className="btn btn-secondary w-full"
            disabled={isApproving || !parsedAmount}
            onClick={handleApprove}
          >
            {isApproving ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : null}
            {isApproving ? "Approving..." : "Approve CLAWD"}
          </button>
        ) : (
          <button
            className="btn btn-primary w-full"
            disabled={isTipping || !parsedAmount}
            onClick={handleTip}
          >
            {isTipping ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : null}
            {isTipping ? "Tipping..." : "🦞 Tip CLAWD"}
          </button>
        )}
      </div>

      {/* Why Tip Section */}
      <div className="bg-base-200 rounded-2xl p-6 w-full max-w-md mb-8">
        <h3 className="text-lg font-bold mb-3">Why tip?</h3>
        <div className="space-y-2 text-sm opacity-80">
          <p>
            Every tip is split {devShareBps ? `${Number(devShareBps) / 100}%` : "50%"} / {devShareBps ? `${(10000 - Number(devShareBps)) / 100}%` : "50%"}:
          </p>
          <div className="flex items-center gap-2">
            <span className="text-lg">👨‍💻</span>
            <span>Half goes to the dev wallet — funding more CLAWD ecosystem builds</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🔥</span>
            <span>Half is burned forever — reducing supply, increasing scarcity</span>
          </div>
          <p className="mt-2 font-medium">
            Tipping = supporting the dev + making everyone&apos;s CLAWD more valuable. Win-win. 🦞
          </p>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-base-100 shadow-xl rounded-2xl p-6 w-full max-w-md mb-8 border border-base-300">
        <h3 className="text-lg font-bold mb-4">🏆 Top Tippers</h3>
        {topAddresses && topAddresses.length > 0 ? (
          <div className="space-y-2">
            {topAddresses.map((addr, i) => {
              const amount = topAmounts[i];
              if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
              return (
                <div key={i} className="flex items-center justify-between bg-base-200 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold opacity-50 w-6">#{i + 1}</span>
                    <Address address={addr} />
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">{formatClawd(amount)}</div>
                    {usdValueBigInt(amount) && (
                      <div className="text-xs opacity-50">{usdValueBigInt(amount)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center opacity-50 py-4">No tips yet — be the first! 🦞</div>
        )}
      </div>

      {/* Recent Tips Feed */}
      <div className="bg-base-100 shadow-xl rounded-2xl p-6 w-full max-w-md border border-base-300">
        <h3 className="text-lg font-bold mb-4">📜 Recent Tips</h3>
        {recentTips.length > 0 ? (
          <div className="space-y-2">
            {recentTips.map((event, i) => (
              <div key={i} className="flex items-center justify-between bg-base-200 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <Address address={event.args.sender} />
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{formatClawd(event.args.amount)}</div>
                  {usdValueBigInt(event.args.amount) && (
                    <div className="text-xs opacity-50">{usdValueBigInt(event.args.amount)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center opacity-50 py-4">No tips yet</div>
        )}
      </div>
    </div>
  );
}

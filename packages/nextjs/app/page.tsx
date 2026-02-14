"use client";

import { useMemo, useState } from "react";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [tipAmount, setTipAmount] = useState("");
  const [tipMessage, setTipMessage] = useState("");

  const { data: contractInfo } = useDeployedContractInfo({ contractName: "CLAWDTipJar" });
  const tipJarAddress = contractInfo?.address;

  // Read contract state
  const { data: totalTips } = useScaffoldReadContract({
    contractName: "CLAWDTipJar",
    functionName: "totalTips",
    watch: true,
  });

  const { data: tipCount } = useScaffoldReadContract({
    contractName: "CLAWDTipJar",
    functionName: "getTipCount",
    watch: true,
  });

  const { data: recentTips } = useScaffoldReadContract({
    contractName: "CLAWDTipJar",
    functionName: "getRecentTips",
    args: [20n],
    watch: true,
  });

  // Read CLAWD balance and allowance
  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [connectedAddress],
    watch: true,
  });

  const { data: allowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [connectedAddress, tipJarAddress],
    watch: true,
  });

  // Write hooks
  const { writeContractAsync: writeApprove, isMining: isApproving } = useScaffoldWriteContract("CLAWD");
  const { writeContractAsync: writeTip, isMining: isTipping } = useScaffoldWriteContract("CLAWDTipJar");

  const parsedAmount = useMemo(() => {
    try {
      return tipAmount ? parseEther(tipAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [tipAmount]);

  const needsApproval = !allowance || allowance < parsedAmount;
  const isWrongNetwork = chain?.id !== targetNetwork.id;

  const handleApprove = async () => {
    if (!parsedAmount || !tipJarAddress) return;
    // Approve 3x the amount (not infinite!)
    const approveAmount = parsedAmount * 3n;
    try {
      await writeApprove({
        functionName: "approve",
        args: [tipJarAddress, approveAmount],
      });
    } catch (e: any) {
      console.error("Approve failed:", e);
    }
  };

  const handleTip = async () => {
    if (!parsedAmount || !tipMessage.trim()) return;
    try {
      await writeTip({
        functionName: "tip",
        args: [parsedAmount, tipMessage],
      });
      setTipAmount("");
      setTipMessage("");
    } catch (e: any) {
      console.error("Tip failed:", e);
    }
  };

  // Build leaderboard from recent tips
  const leaderboard = useMemo(() => {
    if (!recentTips || !Array.isArray(recentTips)) return [];
    const totals: Record<string, bigint> = {};
    for (const tip of recentTips) {
      const addr = tip.tipper;
      totals[addr] = (totals[addr] || 0n) + tip.amount;
    }
    return Object.entries(totals)
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, 10);
  }, [recentTips]);

  const formatClawd = (amount: bigint | undefined) => {
    if (!amount) return "0";
    const formatted = formatEther(amount);
    const num = parseFloat(formatted);
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toFixed(num < 1 ? 4 : 2);
  };

  const shortenAddr = (addr: string) => addr.slice(0, 6) + "..." + addr.slice(-4);

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      {/* Header */}
      <div className="text-center pt-10 pb-6">
        <h1 className="text-5xl font-bold" style={{ color: "#e8a317" }}>
          🦞 CLAWD Tip Jar
        </h1>
        <p className="mt-2 text-lg" style={{ color: "#b8860b" }}>
          Drop some $CLAWD with a message. Top tippers get eternal glory.
        </p>
      </div>

      {/* Stats Bar */}
      <div className="flex justify-center gap-8 mb-8 flex-wrap px-4">
        <div
          className="text-center px-6 py-3 rounded-xl"
          style={{ background: "#1a1207", border: "1px solid #3d2a06" }}
        >
          <div className="text-sm" style={{ color: "#b8860b" }}>
            Total Tipped
          </div>
          <div className="text-2xl font-bold" style={{ color: "#e8a317" }}>
            {formatClawd(totalTips)} CLAWD
          </div>
        </div>
        <div
          className="text-center px-6 py-3 rounded-xl"
          style={{ background: "#1a1207", border: "1px solid #3d2a06" }}
        >
          <div className="text-sm" style={{ color: "#b8860b" }}>
            Tips Sent
          </div>
          <div className="text-2xl font-bold" style={{ color: "#e8a317" }}>
            {tipCount?.toString() || "0"}
          </div>
        </div>
        {connectedAddress && (
          <div
            className="text-center px-6 py-3 rounded-xl"
            style={{ background: "#1a1207", border: "1px solid #3d2a06" }}
          >
            <div className="text-sm" style={{ color: "#b8860b" }}>
              Your Balance
            </div>
            <div className="text-2xl font-bold" style={{ color: "#e8a317" }}>
              {formatClawd(clawdBalance)} CLAWD
            </div>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tip Form */}
        <div className="rounded-2xl p-6" style={{ background: "#141008", border: "1px solid #3d2a06" }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#e8a317" }}>
            🦞 Leave a Tip
          </h2>

          <div className="mb-4">
            <label className="block text-sm mb-1" style={{ color: "#b8860b" }}>
              Amount (CLAWD)
            </label>
            <input
              type="text"
              placeholder="100"
              value={tipAmount}
              onChange={e => setTipAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-lg text-lg font-mono"
              style={{ background: "#0a0a0a", border: "1px solid #3d2a06", color: "#e8a317", outline: "none" }}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm mb-1" style={{ color: "#b8860b" }}>
              Message (max 280 chars)
            </label>
            <textarea
              placeholder="gm lobster fam 🦞"
              value={tipMessage}
              onChange={e => setTipMessage(e.target.value)}
              maxLength={280}
              rows={3}
              className="w-full px-4 py-3 rounded-lg resize-none"
              style={{ background: "#0a0a0a", border: "1px solid #3d2a06", color: "#e8a317", outline: "none" }}
            />
            <div className="text-right text-xs mt-1" style={{ color: "#5c4a1e" }}>
              {tipMessage.length}/280
            </div>
          </div>

          {/* Three-button flow */}
          {!connectedAddress ? (
            <div className="text-center py-3 rounded-lg" style={{ background: "#1a1207", color: "#b8860b" }}>
              Connect your wallet above ↑
            </div>
          ) : isWrongNetwork ? (
            <div className="text-center py-3 rounded-lg" style={{ background: "#1a1207", color: "#b8860b" }}>
              Switch to the correct network ↑
            </div>
          ) : needsApproval && parsedAmount > 0n ? (
            <button
              onClick={handleApprove}
              disabled={isApproving || parsedAmount === 0n}
              className="w-full py-3 rounded-lg text-lg font-bold transition-all"
              style={{
                background: isApproving ? "#3d2a06" : "#b8860b",
                color: isApproving ? "#5c4a1e" : "#0a0a0a",
                cursor: isApproving ? "not-allowed" : "pointer",
              }}
            >
              {isApproving ? "⏳ Approving..." : `Approve ${tipAmount} CLAWD`}
            </button>
          ) : (
            <button
              onClick={handleTip}
              disabled={isTipping || parsedAmount === 0n || !tipMessage.trim()}
              className="w-full py-3 rounded-lg text-lg font-bold transition-all"
              style={{
                background: isTipping || parsedAmount === 0n || !tipMessage.trim() ? "#3d2a06" : "#e8a317",
                color: isTipping || parsedAmount === 0n || !tipMessage.trim() ? "#5c4a1e" : "#0a0a0a",
                cursor: isTipping || parsedAmount === 0n || !tipMessage.trim() ? "not-allowed" : "pointer",
              }}
            >
              {isTipping ? "⏳ Tipping..." : "🦞 Send Tip"}
            </button>
          )}
        </div>

        {/* Leaderboard */}
        <div className="rounded-2xl p-6" style={{ background: "#141008", border: "1px solid #3d2a06" }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#e8a317" }}>
            🏆 Top Tippers
          </h2>
          {leaderboard.length === 0 ? (
            <p className="text-center py-8" style={{ color: "#5c4a1e" }}>
              No tips yet. Be the first! 🦞
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map(([addr, amount], i) => (
                <div
                  key={addr}
                  className="flex items-center justify-between px-4 py-3 rounded-lg"
                  style={{ background: "#0a0a0a", border: "1px solid #1a1207" }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-lg font-bold"
                      style={{ color: i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : "#5c4a1e" }}
                    >
                      #{i + 1}
                    </span>
                    <span className="font-mono text-sm" style={{ color: "#b8860b" }}>
                      {shortenAddr(addr)}
                    </span>
                  </div>
                  <span className="font-bold" style={{ color: "#e8a317" }}>
                    {formatClawd(amount)} CLAWD
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Tips Feed */}
      <div className="max-w-4xl mx-auto px-4 mt-6 pb-16">
        <div className="rounded-2xl p-6" style={{ background: "#141008", border: "1px solid #3d2a06" }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#e8a317" }}>
            📜 Recent Tips
          </h2>
          {!recentTips || recentTips.length === 0 ? (
            <p className="text-center py-8" style={{ color: "#5c4a1e" }}>
              The tip jar is empty. Someone drop some CLAWD! 🦞
            </p>
          ) : (
            <div className="space-y-3">
              {[...recentTips].reverse().map((tip, i) => (
                <div
                  key={i}
                  className="px-4 py-3 rounded-lg"
                  style={{ background: "#0a0a0a", border: "1px solid #1a1207" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm" style={{ color: "#b8860b" }}>
                      {shortenAddr(tip.tipper)}
                    </span>
                    <span className="font-bold text-sm" style={{ color: "#e8a317" }}>
                      {formatClawd(tip.amount)} CLAWD
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "#d4a843" }}>
                    {tip.message}
                  </p>
                  <div className="text-xs mt-1" style={{ color: "#3d2a06" }}>
                    {new Date(Number(tip.timestamp) * 1000).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;

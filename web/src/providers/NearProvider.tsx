"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NearConnector, type EventMap } from "@hot-labs/near-connect";
import {
  CONTRACT_ID,
  NEAR_NETWORK,
  WalletActionSpec,
  fetchAccountBalanceYocto,
} from "@/lib/near";

type ConnectedWallet = Awaited<ReturnType<NearConnector["wallet"]>>;

interface NearContextValue {
  connector: NearConnector | null;
  wallet: ConnectedWallet | null;
  accountId: string;
  balanceYocto: string | null;
  connecting: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  callMethod: (spec: WalletActionSpec) => Promise<unknown>;
  refreshBalance: () => Promise<void>;
}

const NearContext = createContext<NearContextValue>({
  connector: null,
  wallet: null,
  accountId: "",
  balanceYocto: null,
  connecting: false,
  error: null,
  signIn: async () => {},
  signOut: async () => {},
  callMethod: async () => undefined,
  refreshBalance: async () => {},
});

export function NearProvider({ children }: { children: React.ReactNode }) {
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [balanceYocto, setBalanceYocto] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadBalance = useCallback(async (acct: string) => {
    if (!acct) {
      setBalanceYocto(null);
      return;
    }
    try {
      const bal = await fetchAccountBalanceYocto(acct);
      setBalanceYocto(bal);
    } catch {
      // Keep UI usable even if public RPC rate-limits account view
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const instance = new NearConnector({
      network: NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet",
    });

    const handleSignIn = (payload: EventMap["wallet:signIn"]) => {
      if (cancelled) return;
      const acct = payload.accounts[0]?.accountId ?? "";
      setWallet(payload.wallet);
      setAccountId(acct);
      setError(null);
      void loadBalance(acct);
    };

    const handleSignOut = () => {
      if (cancelled) return;
      setWallet(null);
      setAccountId("");
      setBalanceYocto(null);
    };

    instance.on("wallet:signIn", handleSignIn);
    instance.on("wallet:signOut", handleSignOut);
    setConnector(instance);

    // Attempt to restore an already-connected wallet session if available
    void (async () => {
      try {
        const w = await instance.wallet();
        if (!w || cancelled) return;
        const accounts = await w.getAccounts();
        const acct = accounts[0]?.accountId ?? "";
        if (acct && !cancelled) {
          setWallet(w);
          setAccountId(acct);
          void loadBalance(acct);
        }
      } catch {
        // No previous session
      }
    })();

    return () => {
      cancelled = true;
      instance.off("wallet:signIn", handleSignIn);
      instance.off("wallet:signOut", handleSignOut);
    };
  }, [loadBalance]);

  const signIn = useCallback(async () => {
    if (!connector) return;
    setConnecting(true);
    setError(null);
    try {
      const w = await connector.connect();
      setWallet(w);
      const accounts = await w.getAccounts();
      const acct = accounts[0]?.accountId ?? "";
      setAccountId(acct);
      await loadBalance(acct);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection failed");
    } finally {
      setConnecting(false);
    }
  }, [connector, loadBalance]);

  const signOut = useCallback(async () => {
    if (!connector || !wallet) return;
    setError(null);
    try {
      await connector.disconnect(wallet);
    } finally {
      setWallet(null);
      setAccountId("");
      setBalanceYocto(null);
    }
  }, [connector, wallet]);

  const callMethod = useCallback(
    async (spec: WalletActionSpec) => {
      if (!CONTRACT_ID) {
        throw new Error("NEXT_PUBLIC_CONTRACT_ID is not set — use Demo Mode or configure .env.local");
      }
      if (!connector) {
        throw new Error("Wallet connector not initialized");
      }
      const activeWallet = wallet ?? (await connector.wallet());
      const res = await activeWallet.signAndSendTransaction({
        receiverId: CONTRACT_ID,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: spec.methodName,
              args: spec.args,
              gas: spec.gas ?? "60000000000000",
              deposit: spec.deposit ?? "0",
            },
          },
        ],
      });
      if (accountId) {
        void loadBalance(accountId);
      }
      return res;
    },
    [connector, wallet, accountId, loadBalance]
  );

  const refreshBalance = useCallback(async () => {
    if (accountId) await loadBalance(accountId);
  }, [accountId, loadBalance]);

  return (
    <NearContext.Provider
      value={{
        connector,
        wallet,
        accountId,
        balanceYocto,
        connecting,
        error,
        signIn,
        signOut,
        callMethod,
        refreshBalance,
      }}
    >
      {children}
    </NearContext.Provider>
  );
}

export function useNear() {
  return useContext(NearContext);
}


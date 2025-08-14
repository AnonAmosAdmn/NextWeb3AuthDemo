/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useState } from 'react';
import MetaMaskOnboarding from '@metamask/onboarding';
import detectEthereumProvider from '@metamask/detect-provider';
import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: import('ethers').Eip1193Provider;
  }
}

// Minimal ERC-721 ABI
const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function name() view returns (string)"
];

// Minimal ERC-20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

// Contracts & Providers
const NFT_CONTRACT = "0x94475C04c5413c9FE532675fB921fC8b9a24475b";
const ERC20_CONTRACT = "0xF58E363B23fC1BA88f8F75A6EAB57cF6ecaFae05";
const PROJECT_ADDRESS = "0x81Dc669847E8e9Db863bf114a1481A49e5B4940D";
const MONAD_RPC = "https://testnet-rpc.monad.xyz";
const monadProvider = new ethers.JsonRpcProvider(MONAD_RPC);

// Helper to format balances
const formatBalance = (value: string, decimals = 3) =>
  parseFloat(value).toFixed(decimals);

// Centralized provider getter
const getProvider = (): ethers.BrowserProvider | ethers.JsonRpcProvider => {
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  return monadProvider;
};

export default function Page() {
  const [account, setAccount] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [status, setStatus] = useState('Logged out');
  const [onboarding, setOnboarding] = useState<MetaMaskOnboarding | null>(null);
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);
  const [nftName, setNftName] = useState<string | null>(null);
  const [networkName, setNetworkName] = useState<string | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [authState, setAuthState] = useState({
    nonce: null as string | null,
    signature: null as string | null,
    jwtToken: null as string | null,
    jwtPayload: null as any
  });
  const [nftOwnership, setNftOwnership] = useState<{ owns: boolean; balance: string; tokenIds: string[] }>({ owns: false, balance: "0", tokenIds: [] });
  const [erc20Balance, setErc20Balance] = useState<{ symbol: string; balance: string } | null>(null);

  // --- Effects ---
  useEffect(() => {
    setOnboarding(new MetaMaskOnboarding());

    const checkMetaMask = async () => {
      const provider = await detectEthereumProvider({ silent: true });
      setIsMetaMaskInstalled(!!provider);
    };
    checkMetaMask();

    const init = async () => {
      await checkAuth();

      const p = await detectEthereumProvider({ silent: true });
      if (p && p.on) {
        p.on('accountsChanged', async (accounts) => handleAccountChange(accounts[0] || null));
        p.on('chainChanged', fetchNetworkName);
      }
    };
    init();
  }, []);

  // --- Handlers ---
  const handleAccountChange = async (newAccount: string | null) => {
    setAccount(newAccount);
    if (!newAccount) resetState();
    else {
      setStatus(isSignedIn ? 'Authenticated!' : 'Connected');
      await fetchNetworkName();
      await fetchNativeBalance(newAccount);
      await checkNFTOwnership(NFT_CONTRACT, newAccount);
      await fetchERC20Balance(ERC20_CONTRACT, newAccount);
    }
  };

  const resetState = () => {
    setStatus('Logged out');
    setIsSignedIn(false);
    setNetworkName(null);
    setAuthState({ nonce: null, signature: null, jwtToken: null, jwtPayload: null });
    setNftOwnership({ owns: false, balance: "0", tokenIds: [] });
    setErc20Balance(null);
    setAccount(null);
    setNativeBalance(null);
    setNftName(null);
  };

  // --- Check Authentication ---
  const checkAuth = async () => {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      const j = await r.json();

      if (r.ok && j.authenticated) {
        setIsSignedIn(true);
        setAccount(j.address);
        setAuthState(prev => ({
          ...prev,
          jwtToken: j.token,
          jwtPayload: j.payload
        }));
        setStatus('Authenticated!');
        await fetchNetworkName();
        await checkNFTOwnership(NFT_CONTRACT, j.address);
        await fetchERC20Balance(ERC20_CONTRACT, j.address);
        await fetchNativeBalance(j.address);
      } else {
        setIsSignedIn(false);
        setAuthState(prev => ({ ...prev, jwtToken: j.token, jwtPayload: null }));
        if (account) {
          setStatus('Connected');
          await fetchNetworkName();
        } else {
          resetState();
        }
      }
    } catch (err) {
      console.error('Error checking auth:', err);
      resetState();
    }
  };

  // --- Network / Balance ---
  const fetchNetworkName = async () => {
    try {
      const provider = getProvider();
      if (provider instanceof ethers.JsonRpcProvider) {
        setNetworkName("Monad (via RPC)");
        return;
      }
      const chainIdHex = await provider.send("eth_chainId", []);
      const chainIdDecimal = parseInt(chainIdHex, 16);
      setNetworkName(chainIdDecimal === 10143 || chainIdDecimal === 0x279f ? "Monad Testnet" : "Ethereum");
    } catch {
      setNetworkName("Unknown");
    }
  };

  const fetchNativeBalance = async (address: string) => {
    try {
      const provider = getProvider();
      const balanceWei = await provider.getBalance(address);
      setNativeBalance(formatBalance(ethers.formatEther(balanceWei)));
    } catch (err) {
      console.error("Error fetching native balance:", err);
      setNativeBalance(null);
    }
  };

  // --- NFT & ERC20 ---
  const checkNFTOwnership = async (contractAddress: string, userAddress: string) => {
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
      const name = await contract.name();
      setNftName(name);
      const balance = await contract.balanceOf(userAddress);
      const tokenIds: string[] = [];
      for (let i = 0; i < balance; i++) {
        try {
          const tokenId = await contract.tokenOfOwnerByIndex(userAddress, i);
          tokenIds.push(tokenId.toString());
        } catch { break; }
      }
      setNftOwnership({ owns: balance > 0, balance: balance.toString(), tokenIds });
    } catch (err) {
      console.error("Error checking NFT ownership:", err);
      setNftOwnership({ owns: false, balance: "0", tokenIds: [] });
      setNftName(null);
    }
  };

  const fetchERC20Balance = async (contractAddress: string, userAddress: string) => {
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
      const [balanceRaw, decimals, symbol] = await Promise.all([
        contract.balanceOf(userAddress),
        contract.decimals(),
        contract.symbol(),
      ]);
      setErc20Balance({ symbol, balance: formatBalance(ethers.formatUnits(balanceRaw, decimals)) });
    } catch (err) {
      console.error("Error fetching ERC20 balance:", err);
      setErc20Balance(null);
    }
  };

  // --- Wallet / Auth ---
  const connectWallet = async () => {
    const detectedProvider = await detectEthereumProvider();
    if (!detectedProvider) return onboarding?.startOnboarding();

    try {
      await switchToMonad();
      const provider = new ethers.BrowserProvider(detectedProvider as any);
      const accounts = await provider.send("eth_requestAccounts", []);
      handleAccountChange(accounts[0]);
    } catch (err) {
      console.error("Connect wallet error:", err);
    }
  };

  const isSwitchError = (error: unknown): error is { code: number } =>
    typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'number';

  const switchToMonad = async () => {
    const detectedProvider = await detectEthereumProvider();
    if (!detectedProvider) return;
    const provider = detectedProvider as any;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] });
    } catch (switchError) {
      if (isSwitchError(switchError) && switchError.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x279f",
            chainName: "Monad Testnet",
            nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
            rpcUrls: [MONAD_RPC],
            blockExplorerUrls: ["https://explorer.monad.xyz"],
          }],
        });
      } else console.error("Failed to switch network:", switchError);
    }
  };

  const signIn = async () => {
    if (!account) return alert('Connect wallet first');
    setStatus('Signing in...');

    try {
      const r = await fetch(`/api/auth/nonce?address=${account}`);
      const { nonceToken, message } = await r.json();
      setAuthState(prev => ({ ...prev, nonce: message }));

      const provider = getProvider();
      if (!(provider instanceof ethers.BrowserProvider)) throw new Error("No signer available");
      const signer = await provider.getSigner();
      const sig = await signer.signMessage(message);

      const v = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: account, signature: sig, nonceToken }),
      });

      if (v.ok) {
        const json = await v.json();
        setAuthState({ nonce: message, signature: sig, jwtToken: json.token, jwtPayload: json.payload });
        setIsSignedIn(true);
        setStatus('Authenticated!');
        await checkNFTOwnership(NFT_CONTRACT, account);
        await fetchERC20Balance(ERC20_CONTRACT, account);
        await fetchNativeBalance(account);
      } else {
        setStatus('Auth failed');
        resetState();
      }
    } catch (err) {
      console.error(err);
      setStatus('Sign-in failed');
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    resetState();
  };

  const sendMonad = async () => {
    if (!account) return alert('Connect wallet first');
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: PROJECT_ADDRESS,
        value: ethers.parseUnits("1", 18)
      });
      setStatus(`Transaction sent! Hash: ${tx.hash}`);
      await tx.wait();
      setStatus(`Transaction confirmed! Hash: ${tx.hash}`);
    } catch (err: any) {
      console.error(err);
      setStatus(`Transaction failed: ${err.message || err}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">{process.env.NEXT_PUBLIC_APP_NAME || 'Web3 Auth'}</h1>
        <div className="flex items-center space-x-4">
          <span className="bg-gray-700 px-3 py-1 rounded break-words max-w-xs">
            {account ? `${account.substring(0,6)}...${account.substring(account.length-4)}` : 'Not connected'}
          </span>
          {isSignedIn ? (
            <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded">Logout</button>
          ) : account ? (
            <button onClick={signIn} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded">Sign In</button>
          ) : isMetaMaskInstalled ? (
            <button onClick={connectWallet} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">Connect Wallet</button>
          ) : (
            <button onClick={() => onboarding?.startOnboarding()} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded">Install MetaMask</button>
          )}
        </div>
      </header>

      <main className="container mx-auto p-6 flex-grow">
        <div className="bg-gray-800 rounded-lg p-6 shadow-lg max-w-xl mx-auto space-y-6">




          <section className="bg-gray-700 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Status: </h2>
            <p className="mt-1 min-h-[24px] whitespace-pre-wrap">{status || 'Logged out'}</p>
          </section>




          {networkName && (
            <section className="bg-gray-700 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-2">Network Information</h2>
              <p><span className="text-gray-400">Network:</span> {networkName}</p>
            </section>
          )}

          {isSignedIn && (
            <>
              <section className="bg-gray-700 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">NFT Ownership</h2>
                {nftOwnership.owns ? (
                  <div>
                    <p>✅ You own {nftOwnership.balance} NFT(s) from <strong>{nftName || 'NFT Contract'}</strong>.</p>
                    {nftOwnership.tokenIds.length > 0 && (
                      <p className="mt-2 text-sm">Token IDs: {nftOwnership.tokenIds.join(', ')}</p>
                    )}
                  </div>
                ) : (
                  <p>❌ You do not own any NFTs from <strong>{nftName || 'NFT Contract'}</strong>.</p>
                )}
              </section>

              {erc20Balance && (
                <section className="bg-gray-700 p-4 rounded-lg">
                  <h2 className="text-lg font-semibold mb-2">ERC-20 Token Balance</h2>
                  <p>🪙 You have {erc20Balance.balance} <strong>{erc20Balance.symbol}</strong>.</p>
                </section>
              )}

              {nativeBalance && (
                <section className="bg-gray-700 p-4 rounded-lg">
                  <h2 className="text-lg font-semibold mb-2">MONAD Balance</h2>
                  <p>💰 You have {nativeBalance} <strong>MONAD</strong>.</p>
                </section>
              )}

              {isSignedIn && (
                <section className="bg-gray-700 p-4 rounded-lg flex flex-col space-y-2">
                  <h2 className="text-lg font-semibold mb-2">Support the Project</h2>
                  <button
                    onClick={sendMonad}
                    className="bg-yellow-500 hover:bg-yellow-600 px-4 py-2 rounded text-black font-semibold"
                  >
                    DONATE 1 MONAD
                  </button>
                </section>
              )}
            </>
          )}

          {(authState.nonce || authState.signature) && (
            <section className="bg-gray-700 p-4 rounded-lg space-y-4">
              <h2 className="text-lg font-semibold">Authentication Details</h2>
              {authState.nonce && <p><span className="text-gray-400">Nonce message:</span><br /><code className="break-words">{authState.nonce}</code></p>}
              {authState.signature && <p className="break-words"><span className="text-gray-400">Signature:</span><br /><code>{authState.signature}</code></p>}
            </section>
          )}

          {(authState.jwtToken || authState.jwtPayload) && (
            <section className="bg-gray-700 p-4 rounded-lg space-y-4">
              <h2 className="text-lg font-semibold">JWT Information</h2>
              {authState.jwtToken && <p className="break-words"><span className="text-gray-400">Token:</span><br /><code>{authState.jwtToken}</code></p>}
              {authState.jwtPayload && <pre className="bg-gray-800 p-2 rounded max-h-48 overflow-auto text-sm">{JSON.stringify(authState.jwtPayload, null, 2)}</pre>}
            </section>
          )}

        </div>
      </main>
    </div>
  );
}

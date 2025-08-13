/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import React, { useEffect, useState } from 'react';
import MetaMaskOnboarding from '@metamask/onboarding';
import detectEthereumProvider from '@metamask/detect-provider';
import { ethers } from 'ethers';

// Add type declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: import('ethers').Eip1193Provider;
  }
}

// Minimal ERC-721 ABI for NFT ownership
const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function name() view returns (string)"
];

// Minimal ERC-20 ABI for token balance
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

// Contracts
const NFT_CONTRACT = "0x94475C04c5413c9FE532675fB921fC8b9a24475b";
const ERC20_CONTRACT = "0xF58E363B23fC1BA88f8F75A6EAB57cF6ecaFae05";
const PROJECT_ADDRESS = "0xEEfa0c1605562B4Aa419821204836Aa1826775D4";
const MONAD_RPC = "https://testnet-rpc.monad.xyz";

export default function Page() {
  const [account, setAccount] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [status, setStatus] = useState('Logged out');
  const [onboarding, setOnboarding] = useState<MetaMaskOnboarding | null>(null);
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);
  const [nftName, setNftName] = useState<string | null>(null);
  const [networkName, setNetworkName] = useState<string | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);

  // Combined auth state to preserve both signature and JWT info
  const [authState, setAuthState] = useState({
    nonce: null as string | null,
    signature: null as string | null,
    jwtToken: null as string | null,
    jwtPayload: null as any,
  });

  // NFT ownership state
  const [nftOwnership, setNftOwnership] = useState<{ owns: boolean; balance: string; tokenIds: string[] }>({ owns: false, balance: "0", tokenIds: [] });
  
  // ERC20 balance state
  const [erc20Balance, setErc20Balance] = useState<{ symbol: string; balance: string } | null>(null);

  useEffect(() => {
    setOnboarding(new MetaMaskOnboarding());

    const checkMetaMask = async () => {
      const provider = await detectEthereumProvider({ silent: true });
      setIsMetaMaskInstalled(!!provider);
    };

    checkMetaMask();

    (async () => {
      await checkAuth();

      const p = await detectEthereumProvider({ silent: true });
      if (p && p.on) {
        p.on('accountsChanged', async (accounts) => {
          const newAccount = accounts[0] || null;
          setAccount(newAccount);
          if (!newAccount) {
            resetState();
          } else {
            setStatus(isSignedIn ? 'Authenticated!' : 'Connected');
            await fetchNetworkName();
            await fetchNativeBalance(newAccount);
            await checkNFTOwnership(NFT_CONTRACT, newAccount);
            await fetchERC20Balance(ERC20_CONTRACT, newAccount);
          }
        });

        p.on('chainChanged', async () => {
          await fetchNetworkName();
        });
      }
    })();
  }, []);

  function resetState() {
    setStatus('');
    setIsSignedIn(false);
    setNetworkName(null);
    setAuthState({ nonce: null, signature: null, jwtToken: null, jwtPayload: null });
    setNftOwnership({ owns: false, balance: "0", tokenIds: [] });
    setErc20Balance(null);
    setAccount(null);
  }



  async function fetchNativeBalance(address: string) {
    if (!address) return;
    try {
      // Use a JSON-RPC provider for Monad
      const provider = new ethers.JsonRpcProvider(MONAD_RPC);
      const balanceWei = await provider.getBalance(address);
      const balance = ethers.formatEther(balanceWei);
      setNativeBalance(parseFloat(balance).toFixed(3));
    } catch (err) {
      console.error("Error fetching native balance:", err);
      setNativeBalance(null);
    }
  }




  async function sendMonad() {
    if (!account) return alert('Connect wallet first');
    if (!window.ethereum) return alert('Ethereum provider not found');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
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
  }




  async function checkAuth() {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      const j = await r.json();

      if (r.ok && j.authenticated) {
        setIsSignedIn(true);
        setAccount(j.address);
        setAuthState({ ...authState, jwtToken: j.token, jwtPayload: j.payload });
        setStatus('Authenticated!');
        await fetchNetworkName();
        await checkNFTOwnership(NFT_CONTRACT, j.address);
        await fetchERC20Balance(ERC20_CONTRACT, j.address);
      } else {
        setIsSignedIn(false);
        setAuthState({ ...authState, jwtToken: j.token, jwtPayload: null });
        if (account) {
          setStatus('Connected');
          await fetchNetworkName();
        } else {
          setStatus('');
          setNetworkName(null);
        }
        setAuthState({ ...authState, nonce: null, signature: null });
      }
    } catch {
      resetState();
    }
  }

  async function connectWallet() {
    const detectedProvider = await detectEthereumProvider();

    if (!detectedProvider) {
      if (onboarding) onboarding.startOnboarding();
      return;
    }

    try {
      await switchToMonad();

      const provider = new ethers.BrowserProvider(detectedProvider as unknown as ethers.Eip1193Provider);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setStatus("Connected");

      await fetchNetworkName();
    } catch (e) {
      console.error(e);
    }
  }

  function isSwitchError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'number';
  }

  async function switchToMonad() {
    const detectedProvider = await detectEthereumProvider();
    if (!detectedProvider) return;
    const provider = detectedProvider as any;

    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] });
    } catch (switchError) {
      if (isSwitchError(switchError) && switchError.code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x279f",
              chainName: "Monad Testnet",
              nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
              rpcUrls: ["https://testnet-rpc.monad.xyz"],
              blockExplorerUrls: ["https://explorer.monad.xyz"],
            }],
          });
        } catch (addError) {
          console.error("Failed to add Monad Testnet:", addError);
        }
      } else {
        console.error("Failed to switch network:", switchError);
      }
    }
  }

  async function fetchNetworkName() {
    try {
      if (!window.ethereum) { setNetworkName("Unknown"); return; }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const chainIdHex = await provider.send("eth_chainId", []);
      const chainIdDecimal = parseInt(chainIdHex, 16);

      if (chainIdDecimal === 10143) setNetworkName("Monad Testnet");
      else {
        const network = await provider.getNetwork();
        setNetworkName(network.name || "Unknown");
      }
    } catch (error) {
      console.error("Error fetching network name:", error);
      setNetworkName("Unknown");
    }
  }

  async function checkNFTOwnership(contractAddress: string, userAddress: string) {
    try {
      if (!window.ethereum) throw new Error("Ethereum provider not found");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);

      // Fetch NFT name
      const name = await contract.name();
      setNftName(name);

      const balance = await contract.balanceOf(userAddress);
      const tokenIds: string[] = [];

      if (balance > 0) {
        for (let i = 0; i < balance; i++) {
          try {
            const tokenId = await contract.tokenOfOwnerByIndex(userAddress, i);
            tokenIds.push(tokenId.toString());
          } catch { break; }
        }
      }

      setNftOwnership({ owns: balance > 0, balance: balance.toString(), tokenIds });
    } catch (err) {
      console.error("Error checking NFT ownership:", err);
      setNftOwnership({ owns: false, balance: "0", tokenIds: [] });
      setNftName(null);
    }
  }

  async function fetchERC20Balance(contractAddress: string, userAddress: string) {
    if (!window.ethereum) {
      console.error("Ethereum provider not found");
      setErc20Balance(null);
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);

      const [balanceRaw, decimals, symbol] = await Promise.all([
        contract.balanceOf(userAddress),
        contract.decimals(),
        contract.symbol(),
      ]);

      const balanceFormatted = parseFloat(ethers.formatUnits(balanceRaw, decimals)).toFixed(3);
      setErc20Balance({ symbol, balance: balanceFormatted });
    } catch (err) {
      console.error("Error fetching ERC20 balance:", err);
      setErc20Balance(null);
    }
  }


  async function signIn() {
    if (!account) return alert('Connect wallet first');

    setStatus('Requesting nonce token...');
    const r = await fetch(`/api/auth/nonce?address=${account}`);
    if (!r.ok) { setStatus('Failed to get nonce'); return; }

    const { nonceToken, message } = await r.json();
    setAuthState(prev => ({ ...prev, nonce: message }));

    setStatus('Signing message...');
    if (!window.ethereum) { setStatus('Ethereum provider not found'); return; }
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const sig = await signer.signMessage(message);
    setAuthState(prev => ({ ...prev, signature: sig }));

    setStatus('Verifying signature on server...');
    const v = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ address: account, signature: sig, nonceToken }),
    });

    if (v.ok) {
      const json = await v.json();

      // Update everything in one go
      const newAddress = json.address || account;
      setAccount(newAddress);
      setAuthState({
        nonce: message,
        signature: sig,
        jwtToken: json.token,
        jwtPayload: json.payload,
      });
      setIsSignedIn(true);
      setStatus('Authenticated!');

      // Fetch NFT & ERC20 balances using the newly authenticated address
      await checkNFTOwnership(NFT_CONTRACT, newAddress);
      await fetchERC20Balance(ERC20_CONTRACT, newAddress);
      await fetchNativeBalance(newAddress);
    } else {
      const err = await v.json();
      setStatus('Auth failed: ' + (err?.error || v.statusText));
      resetState();
    }
  }


  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    resetState();
    setStatus('Logged out');
  }

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

          <div className="text-sm text-gray-400">
            <strong>Status:</strong>
            <p className="mt-1 min-h-[24px] whitespace-pre-wrap">{status || 'Logged out'}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

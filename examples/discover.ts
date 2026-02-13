/**
 * Supertonic Service Discovery Utility
 * Exports functions to find servers on the local network
 */

import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { yamux } from "@chainsafe/libp2p-yamux";
import { noise } from "@chainsafe/libp2p-noise";
import { mdns } from "@libp2p/mdns";
import { multiaddr } from "@multiformats/multiaddr";

/**
 * Interface for discovered peer information
 */
export interface DiscoveredPeer {
  id: string;
  ip: string;
  multiaddr: any;
  isLocal: boolean;
}

/**
 * Interface for libp2p discovery events
 */
interface PeerDiscoveryEvent {
  id: { toString(): string };
  multiaddrs: { toString(): string }[];
}

/**
 * Searches for all Supertonic servers on the local network
 * @param timeoutMs How long to search before giving up (default 10s)
 * @returns A list of unique peers discovered
 */
export async function discoverAllServers(timeoutMs: number = 10000): Promise<DiscoveredPeer[]> {
  const node = await createLibp2p({
    transports: [tcp()],
    streamMuxers: [yamux()],
    connectionEncrypters: [noise()],
    peerDiscovery: [
      mdns({
        interval: 1000,
      })
    ],
  });

  const discoveredPeers = new Map<string, DiscoveredPeer>();
  
  // Populate local IPs to distinguish between LOCAL and REMOTE
  const { networkInterfaces } = await import("os");
  const localIps = new Set<string>();
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4") {
        localIps.add(net.address);
      }
    }
  }
  
  await node.start();

  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      const results = Array.from(discoveredPeers.values());
      resolve(results);
      
      // Stop node in the background to avoid hanging the promise
      const stopPromise = node.stop();
      if (stopPromise && typeof stopPromise.catch === "function") {
          stopPromise.catch((err: any) => {
            if (import.meta.main) console.warn("Error stopping discovery node:", err.message);
          });
      }
    }, timeoutMs);

    node.addEventListener("peer:discovery", (event: any) => {
      const peer = event.detail as PeerDiscoveryEvent;
      const peerId = peer.id.toString();
      
      if (peer.multiaddrs) {
        for (const addr of peer.multiaddrs) {
          const addrStr = addr.toString();
          const ipMatch = addrStr.match(/\/ip4\/([0-9.]+)/);
          
          if (ipMatch && ipMatch[1] && ipMatch[1] !== "127.0.0.1") {
            const foundIp = ipMatch[1];
            if (!discoveredPeers.has(peerId)) {
                const isLocal = localIps.has(foundIp);
                discoveredPeers.set(peerId, {
                    id: peerId,
                    ip: foundIp,
                    multiaddr: multiaddr(addrStr),
                    isLocal
                });
                
                if (import.meta.main) {
                    console.log(`✨ Discovered ${isLocal ? 'LOCAL ' : 'REMOTE'} server: ${foundIp} (${peerId.substring(0, 10)}...)`);
                }
            }
          }
        }
      }
    });
  });
}

/**
 * Returns the most likely server (remote preferred, then local)
 */
export async function discoverServer(timeoutMs: number = 10000): Promise<DiscoveredPeer> {
  const found = await discoverAllServers(timeoutMs);
  
  // 1. Prefer other remote servers
  const remote = found.find(p => !p.isLocal);
  if (remote) return remote;
  // 2. Fallback to local
  const local = found.find(p => p.isLocal);
  if (local) return local;
  
  throw new Error("Discovery timeout: No server found on the network");
}

// Main execution block
if (import.meta.main) {
  console.log("====================================================");
  console.log("🔍 NETWORK DISCOVERY TOOL");
  console.log("====================================================");
  
  
  console.log("\n📡 Scanning for peers (mDNS)...");
  console.log("----------------------------------------------------");

  const start = Date.now();
  discoverAllServers(8000)
    .then(peers => {
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log("----------------------------------------------------");
      
      if (peers.length === 0) {
        console.log(`\n❌ No servers found after ${duration}s.`);
      } else {
        console.log(`\n✅ Discovery complete in ${duration}s!`);
        console.log(`Found ${peers.length} unique server(s):`);
        
        peers.forEach((peer, i) => {
          console.log(`  ${i + 1}. ${peer.isLocal ? '[LOCAL]' : '[REMOTE]'} IP: ${peer.ip}`);
          console.log(`     ID: ${peer.id}`);
          console.log(`     MA: ${peer.multiaddr}`);
        });

        const best = peers.find(p => !p.isLocal) || peers[0];
        if (best) {
          console.log(`\n👉 Recommended connection: ${best.ip}`);
        }
      }
      console.log("====================================================");
    })
    .catch(err => {
      console.error(`\n❌ Error during discovery: ${err.message}`);
    });
}

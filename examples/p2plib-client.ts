/**
 * P2P Lib Client Example
 * 
 * This example demonstrates how to connect to a Guardian API server
 * using libp2p peer-to-peer communication.
 * 
 * Usage:
 *   bun run examples/p2plib-client.ts
 */

import { P2PClient } from "../plugins/network/p2p.ts";
import type { P2PResponse } from "../plugins/network/p2p.ts";
import type { Multiaddr } from "@multiformats/multiaddr";

/**
 * P2P Client for connecting to Guardian API servers
 */
class P2PGuardianClient extends P2PClient {
  /**
   * Initialize the libp2p node
   */
  async initClient(port: number = 0): Promise<void> {
    await this.init({ listenPort: port });
  }

  /**
   * Connect to a specific peer by multiaddress
   */
  async connectToPeer(addr: string | Multiaddr): Promise<void> {
    await this.connect(addr);
  }

  /**
   * Get server status
   */
  async getStatus(): Promise<P2PResponse> {
    return this.sendRequest({ method: "status" });
  }

  /**
   * Send a command to the Minecraft server
   */
  async sendCommand(command: string): Promise<P2PResponse> {
    return this.sendRequest({
      method: "write",
      params: { command },
    });
  }

  /**
   * Start the Minecraft server
   */
  async startServer(): Promise<P2PResponse> {
    return this.sendRequest({ method: "server:start" });
  }

  /**
   * Stop the Minecraft server
   */
  async stopServer(): Promise<P2PResponse> {
    return this.sendRequest({ method: "server:stop" });
  }
}

// Example usage
async function main() {
  const client = new P2PGuardianClient();

  try {
    // Initialize the P2P client on an ephemeral port
    await client.initClient(0);

    // Wait a bit for peer discovery if needed
    console.log("🔍 Looking for peers in the network...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // List discovered peers
    const selfId = client.node?.peerId.toString();
    const peers = client.getDiscoveredPeers().filter(id => id !== selfId);
    console.log(`📋 Found ${peers.length} peer(s) via discovery`);

    if (peers.length === 0) {
      console.log("⚠️  No peers found via discovery. You can connect manually.");
      console.log("   Example: await client.connectToPeer('/ip4/127.0.0.1/tcp/9000/p2p/...')");
    } else {
      const targetPeer = peers[0];
      const addrs = client.getPeerMultiaddrs(targetPeer!);
      
      // Prefer network IP over localhost if available
      const bestAddr = addrs.find(a => !a.toString().includes('127.0.0.1')) || addrs[0];

      if (bestAddr) {
          console.log(`\n🎯 Connecting to discovered peer: ${targetPeer}`);
          console.log(`📍 Using address: ${bestAddr.toString()}`);
          await client.connectToPeer(bestAddr);

          console.log("\n--- Requesting Server Status ---");
          const status = await client.getStatus();
          console.log("Status Result:", JSON.stringify(status, null, 2));
      }
    }
  } catch (error) {
    console.error("❌ Error during P2P client operation:", error);
  } finally {
    // Keep it running or stop
    // await client.stop();
  }
}

// Run the example
if (import.meta.main) {
  main().catch(console.error);
}

export { P2PGuardianClient };

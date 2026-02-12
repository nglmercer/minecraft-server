/**
 * P2P Lib Client Example
 * 
 * This example demonstrates how to connect to a Guardian API server
 * using libp2p peer-to-peer communication.
 * 
 * Prerequisites:
 *   bun add libp2p @libp2p/tcp @chainsafe/libp2p-yamux @chainsafe/libp2p-noise @libp2p/mdns
 * 
 * Usage:
 *   bun run examples/p2plib-client.ts
 */

// Interface for the stream as used in the code (read/write/close)
interface NetworkStream {
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array | Buffer): Promise<void>;
  close(): void;
}

// P2P API Request/Response types
interface P2PRequest {
  method: "write" | "write-batch" | "server:start" | "server:stop" | "server:restart" | "backup:create" | "tunnel:restart" | "status";
  params?: Record<string, any>;
}

type P2PResponse<T = any> =
  | { success: true; result: T }
  | { success: false; error: string };

/**
 * P2P Client for connecting to Guardian API servers
 */
class P2PGuardianClient {
  private node: any = null;
  private targetPeerId: string | null = null;

  /**
   * Initialize the libp2p node
   */
  async init(port: number = 9001): Promise<void> {
    const { createLibp2p } = await import("libp2p");
    const { tcp } = await import("@libp2p/tcp");
    const { yamux } = await import("@chainsafe/libp2p-yamux");
    const { noise } = await import("@chainsafe/libp2p-noise");
    const { mdns } = await import("@libp2p/mdns");

    this.node = await createLibp2p({
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${port}`],
      },
      transports: [tcp()],
      streamMuxers: [yamux()],
      connectionEncrypters: [noise()],
      peerDiscovery: [
        mdns({
          interval: 1000,
        }),
      ],
    });

    // Set up peer discovery events
    this.node.addEventListener("peer:connect", (event: CustomEvent<any>) => {
      console.log(`🔗 Discovered peer: ${event.detail.toString()}`);
    });

    this.node.addEventListener("peer:disconnect", (event: CustomEvent<any>) => {
      console.log(`🔌 Disconnected from peer: ${event.detail.toString()}`);
    });

    await this.node.start();
    console.log("✅ P2P client initialized");
    console.log(`📍 Node ID: ${this.node.peerId.toString()}`);
  }

  /**
   * Connect to a specific peer by multiaddress
   */
  async connectToPeer(multiaddr: string): Promise<void> {
    if (!this.node) {
      throw new Error("Node not initialized. Call init() first.");
    }

    console.log(`🔗 Connecting to peer at: ${multiaddr}`);
    const connection = await this.node.dial(multiaddr);
    this.targetPeerId = connection.remotePeer.toString();
    console.log(`✅ Connected to peer: ${this.targetPeerId}`);
  }

  /**
   * Discover and list available peers
   */
  async discoverPeers(): Promise<string[]> {
    if (!this.node) {
      throw new Error("Node not initialized. Call init() first.");
    }

    const peers = this.node.getPeers();
    console.log(`📋 Found ${peers.length} peer(s):`);
    peers.forEach((peer: any) => {
      console.log(`  - ${peer.toString()}`);
    });
    return peers.map((p: any) => p.toString());
  }

  /**
   * Send a request to a Guardian server via P2P
   */
  async sendRequest(request: P2PRequest, peerId?: string): Promise<P2PResponse> {
    if (!this.node) {
      throw new Error("Node not initialized. Call init() first.");
    }

    const targetPeer = peerId || this.targetPeerId;
    if (!targetPeer) {
      throw new Error("No target peer specified. Connect to a peer first or provide peerId.");
    }

    console.log(`📤 Sending request: ${request.method}`);

    // Open a stream to the target peer
    const stream = await this.node.openStream(targetPeer, "/guardian-api/1.0.0") as NetworkStream;

    try {
      // Send the request
      const requestBuffer = Buffer.from(JSON.stringify(request) + "\n");
      await stream.write(requestBuffer);

      // Read the response
      let buffer = Buffer.alloc(0);
      let responseText: string | null = null;

      while (true) {
        const chunk = await stream.read();
        if (chunk === null) break;
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        const newlineIndex = buffer.indexOf(10); // '\n'
        if (newlineIndex !== -1) {
          responseText = buffer.toString("utf8", 0, newlineIndex);
          break;
        }
      }

      if (!responseText) {
        throw new Error("No response received from server");
      }

      const response = JSON.parse(responseText) as P2PResponse;
      console.log(`📥 Response:`, response);
      return response;
    } finally {
      stream.close();
    }
  }

  /**
   * Get server status
   */
  async getStatus(peerId?: string): Promise<P2PResponse> {
    return this.sendRequest({ method: "status" }, peerId);
  }

  /**
   * Send a command to the Minecraft server
   */
  async sendCommand(command: string, peerId?: string): Promise<P2PResponse> {
    return this.sendRequest({
      method: "write",
      params: { command },
    }, peerId);
  }

  /**
   * Send multiple commands to the Minecraft server
   */
  async sendCommands(commands: string[], peerId?: string): Promise<P2PResponse> {
    return this.sendRequest({
      method: "write-batch",
      params: { commands },
    }, peerId);
  }

  /**
   * Start the Minecraft server
   */
  async startServer(peerId?: string): Promise<P2PResponse> {
    return this.sendRequest({ method: "server:start" }, peerId);
  }

  /**
   * Stop the Minecraft server
   */
  async stopServer(peerId?: string): Promise<P2PResponse> {
    return this.sendRequest({ method: "server:stop" }, peerId);
  }

  /**
   * Restart the Minecraft server
   */
  async restartServer(peerId?: string): Promise<P2PResponse> {
    return this.sendRequest({ method: "server:restart" }, peerId);
  }

  /**
   * Create a backup
   */
  async createBackup(peerId?: string): Promise<P2PResponse> {
    return this.sendRequest({ method: "backup:create" }, peerId);
  }

  /**
   * Restart the tunnel
   */
  async restartTunnel(peerId?: string): Promise<P2PResponse> {
    return this.sendRequest({ method: "tunnel:restart" }, peerId);
  }

  /**
   * Stop the P2P client
   */
  async stop(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      console.log("🛑 P2P client stopped");
    }
  }
}

// Example usage
async function main() {
  const client = new P2PGuardianClient();

  try {
    // Initialize the P2P client
    await client.init(9001);

    // Wait a bit for peer discovery
    console.log("🔍 Discovering peers...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // List discovered peers
    const peers = await client.discoverPeers();

    if (peers.length === 0) {
      console.log("⚠️  No peers found. You can connect manually using connectToPeer()");
      console.log("   Example: client.connectToPeer('/ip4/192.168.1.100/tcp/9000/p2p/12D3KooW...')");
      
      // Keep running to allow manual connection
      console.log("\n📡 Waiting for peers... (Press Ctrl+C to exit)");
      await new Promise(() => {}); // Run forever
    } else {
      // Use the first discovered peer
      const targetPeer = peers[0];
      console.log(`\n🎯 Using peer: ${targetPeer}`);

      // Get server status
      console.log("\n--- Getting Server Status ---");
      const status = await client.getStatus(targetPeer);
      console.log("Status:", JSON.stringify(status, null, 2));

      // Example: Send a command to the Minecraft server
      // console.log("\n--- Sending Command ---");
      // const result = await client.sendCommand("say Hello from P2P!", targetPeer);
      // console.log("Result:", result);

      // Example: Start the server
      // console.log("\n--- Starting Server ---");
      // const startResult = await client.startServer(targetPeer);
      // console.log("Start result:", startResult);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    // Uncomment to stop the client after operations
    // await client.stop();
  }
}

// Run the example
main().catch(console.error);

export { P2PGuardianClient };

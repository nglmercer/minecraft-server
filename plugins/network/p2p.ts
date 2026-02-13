import { createLibp2p } from "libp2p";
import type { Libp2p, Stream, Connection } from "@libp2p/interface";
import { tcp } from "@libp2p/tcp";
import { yamux } from "@chainsafe/libp2p-yamux";
import { noise } from "@chainsafe/libp2p-noise";
import { mdns } from "@libp2p/mdns";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { peerIdFromString } from "@libp2p/peer-id";
import { Uint8ArrayList } from "uint8arraylist";

// --- Types ---
export interface P2PRequest {
  method: string;
  params?: Record<string, any>;
}

export interface P2PResponse<T = any> {
  success: boolean;
  result?: T;
  error?: string;
}

export interface P2PClientConfig {
  peerDiscoveryInterval?: number;
  listenPort?: number;
}

// --- Internal Stream Interface ---
export interface NetworkStream {
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array | Buffer): Promise<void>;
  close(): Promise<void>;
}

// --- Internal Stream Type for Compatibility ---
interface InternalLibp2pStream {
  source?: { [Symbol.asyncIterator](): AsyncIterator<any> };
  sink?: (source: AsyncIterable<any>) => Promise<void>;
  send?(data: Uint8ArrayList): void;
  sendData?(data: Uint8ArrayList): void;
  push?(data: Uint8ArrayList): void;
  write?(data: Uint8Array | Buffer): void;
  close?(): Promise<void>;
  end?(): void;
  [Symbol.asyncIterator]?(): AsyncIterator<any>;
  constructor?: { name: string };
}

/**
 * Wraps various stream implementations into a unified interface
 */
export function wrapStream(stream: Stream | InternalLibp2pStream): NetworkStream {
  if (!stream) throw new Error("Cannot wrap undefined/null stream");

  const s = stream as InternalLibp2pStream;
  const hasSource = !!(s.source && s.source[Symbol.asyncIterator]);
  const hasSink = typeof s.sink === 'function';
  
  if (hasSource && hasSink) {
    // Older standard libp2p stream (has source and sink)
    const iterator = s.source![Symbol.asyncIterator]();
    let resolveNext: ((v: IteratorResult<Uint8ArrayList>) => void) | null = null;
    const queue: Uint8ArrayList[] = [];
    
    const outgoing: AsyncIterator<Uint8ArrayList> & AsyncIterable<Uint8ArrayList> = {
      [Symbol.asyncIterator]() { return this; },
      async next(): Promise<IteratorResult<Uint8ArrayList>> {
        if (queue.length > 0) {
          const value = queue.shift();
          if (value === null) return { done: true, value: undefined };
          return { done: false, value: value as Uint8ArrayList };
        }
        return new Promise(resolve => { resolveNext = resolve; });
      }
    };

    s.sink!(outgoing).catch((err: Error) => console.log("[P2P] Sink disconnected:", err.message));

    return {
      async read() {
        const result = await iterator.next();
        if (result.done) return null;
        const val = result.value;
        if (val instanceof Uint8Array) return val;
        return val instanceof Uint8ArrayList ? val.subarray() : new Uint8Array(val);
      },
      async write(data: Uint8Array | Buffer) {
        const list = new Uint8ArrayList(data);
        if (resolveNext) {
            const resolve = resolveNext;
            resolveNext = null;
            resolve({ done: false, value: list });
        } else {
            queue.push(list);
        }
      },
      async close() {
        if (resolveNext) {
            const resolve = resolveNext;
            resolveNext = null;
            resolve({ done: true, value: undefined });
        } else {
            (queue as any).push(null);
        }
        if (s.close) await s.close();
      }
    };
  }

  // Modern Stream (is AsyncIterable and has send/push)
  if (s[Symbol.asyncIterator]) {
      const iterator = s[Symbol.asyncIterator]!();
      
      return {
          async read() {
              const result = await iterator.next();
              if (result.done) return null;
              const val = result.value;
              if (val instanceof Uint8Array) return val;
              if (val instanceof Uint8ArrayList) return val.subarray();
              return new Uint8Array(val);
          },
          async write(data: Uint8Array | Buffer) {
              const list = new Uint8ArrayList(data);
              if (typeof s.send === 'function') {
                  s.send(list);
              } else if (typeof s.sendData === 'function') {
                  s.sendData(list);
              } else if (typeof s.push === 'function') {
                  s.push(list);
              } else if (typeof s.write === 'function') {
                  s.write(data);
              } else {
                  throw new Error("Stream not writable");
              }
          },
          async close() {
              if (typeof s.close === 'function') await s.close();
              else if (typeof s.end === 'function') s.end();
          }
      };
  }

  throw new Error(`Unsupported stream type: ${s.constructor?.name || typeof s}`);
}

/**
 * P2P Node Implementation (Client & Server)
 */
export class P2PNode {
  public node: Libp2p | null = null;
  protected currentPeer: any = null; // Last connected peer
  protected discoveredPeers: Map<string, Multiaddr[]> = new Map();
  
  constructor(protected config: P2PClientConfig = {}) {}

  /**
   * Initialize the libp2p node
   */
  async init(config?: P2PClientConfig): Promise<void> {
    this.config = { ...this.config, ...config };    
    const port = this.config.listenPort ?? 0;
    
    this.node = await createLibp2p({
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${port}`],
      },
      transports: [tcp()],
      streamMuxers: [yamux()],
      connectionEncrypters: [noise()],
      peerDiscovery: [
        mdns({
          interval: this.config.peerDiscoveryInterval || 1000,
        }),
      ],
    });

    await this.node.start();
    console.log(`[P2P] Node started with ID: ${this.node.peerId.toString()}`);
    
    this.node.addEventListener("peer:discovery", (evt: any) => {
        const peerId = evt.detail.id.toString();
        this.discoveredPeers.set(peerId, evt.detail.multiaddrs);
    });

    this.node.addEventListener("peer:connect", (evt: any) => {
        console.log(`[P2P] Connected to ${evt.detail.toString()}`);
    });
  }

  /**
   * Register a protocol handler
   */
  handle(protocol: string, handler: (data: { stream: NetworkStream, connection: Connection }) => Promise<void>) {
      if (!this.node) throw new Error("Node not initialized");
      
      this.node.handle(protocol, async (args: any) => {
          const { stream, connection } = args;
          let rawStream = stream || (args[Symbol.asyncIterator] ? args : null);

          try {
              const wrapped = wrapStream(rawStream);
              await handler({ stream: wrapped, connection });
          } catch (err) {
              console.error(`[P2P] Error in protocol handler for ${protocol}:`, err);
          }
      });
  }

  /**
   * Connect to a remote peer using a multiaddr string or Multiaddr
   */
  async connect(address: string | Multiaddr): Promise<void> {
    if (!this.node) throw new Error("Node not initialized");
    
    let target: any = address;
    if (typeof address === 'string' && address.startsWith('/')) {
        target = multiaddr(address);
    }

    console.log(`[P2P] Dialing ${address.toString()}...`);
    const conn = await this.node.dial(target);
    this.currentPeer = conn.remotePeer;
    console.log(`[P2P] Connection established with ${this.currentPeer.toString()}`);
  }

  /**
   * Send a JSON request and await a JSON response
   */
  async sendRequest<T = any>(request: P2PRequest, protocol: string = "/guardian-api/1.0.0", peer?: any): Promise<P2PResponse<T>> {
    if (!this.node) throw new Error("Node not initialized");
    
    const target = peer || this.currentPeer;
    if (!target) throw new Error("Not connected to a peer");

    const rawStream = await this.node.dialProtocol(target, protocol);
    const stream = wrapStream(rawStream);
    
    try {
        const reqStr = JSON.stringify(request) + "\n";
        await stream.write(Buffer.from(reqStr));
        
        let buffer = Buffer.alloc(0);
        while (true) {
            const chunk = await stream.read();
            if (chunk === null) break;
            
            buffer = Buffer.concat([buffer, chunk]);
            const nlIdx = buffer.indexOf('\n');
            if (nlIdx !== -1) {
                const line = buffer.subarray(0, nlIdx).toString('utf8');
                try {
                    return JSON.parse(line);
                } catch (e) {
                    throw new Error(`Invalid JSON response: ${line}`);
                }
            }
        }
        
        throw new Error("Connection closed before response received");
    } finally {
        await stream.close();
    }
  }

  getPeers(): string[] {
      if (!this.node) return [];
      return this.node.getPeers().map((p) => p.toString());
  }

  getDiscoveredPeers(): string[] {
      return Array.from(this.discoveredPeers.keys());
  }

  getPeerMultiaddrs(peerId: string): Multiaddr[] {
      return this.discoveredPeers.get(peerId) || [];
  }

  async stop(): Promise<void> {
      if (this.node) await this.node.stop();
      console.log("[P2P] Node stopped");
  }
}

export class P2PClient extends P2PNode {}

import { type IPlugin, type PluginContext } from "bun_plugins";
import { Config } from "../src/services/config.service";
import { type Libp2p } from "libp2p";
import { ApiSchemas } from "../src/utils/parsejson";
import { type } from "arktype";
import { type Server, type ServerWebSocket } from "bun";

import { wrapStream, type NetworkStream } from "./network/p2p";

// P2P API Request/Response types
type P2PRequest = 
  | { method: "write"; params: { command: string } }
  | { method: "write-batch"; params: { commands: string[] } }
  | { method: "server:start" | "server:stop" | "server:restart" | "backup:create" | "tunnel:restart" | "status"; params?: Record<string, unknown> };

type P2PResponse<T = unknown> =
  | { success: true; result: T }
  | { success: false; error: string };

/**
 * API Plugin that provides a REST and WebSocket interface for server control.
 * Uses Bun.serve and Bun WebSocket features.
 * Includes optional libp2p support for P2P communication.
 */
export class ApiPlugin implements IPlugin {
  name = "api-control";
  version = "1.0.0";
  description = "Provides Web and WebSocket API for server control and monitoring";
  author = "Guardian Team";

  private context!: PluginContext;
  private server: Server<undefined> | null = null;
  private sockets = new Set<ServerWebSocket<undefined>>();
  private libp2pNode: Libp2p | null = null;

  // Environment configuration
  private readonly PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3000;
  private readonly LIBP2P_PORT = process.env.LIBP2P_PORT ? parseInt(process.env.LIBP2P_PORT) : 9000;
  private readonly LIBP2P_ENABLED = process.env.LIBP2P_ENABLED !== "false"; // Enabled by default

  onLoad(context: PluginContext): void {
    this.context = context;
    this.startServer();
    this.setupEventListeners();
    
    // Initialize libp2p asynchronously
    if (this.LIBP2P_ENABLED) {
      this.initLibp2p().catch((err: Error) => {
        this.context.emit("log", { level: "warn", message: `Libp2p initialization failed: ${err.message}` });
      });
    }
  }

  async onUnload(): Promise<void> {
    if (this.server) {
      this.server.stop();
    }
    if (this.libp2pNode) {
      await this.libp2pNode.stop()
    }
  }

  private async initLibp2p(): Promise<void> {
    try {
      // Dynamic imports to avoid requiring packages if not enabled
      const { createLibp2p } = await import("libp2p");
      const { tcp } = await import("@libp2p/tcp");
      const { yamux } = await import("@chainsafe/libp2p-yamux");
      const { noise } = await import("@chainsafe/libp2p-noise");
      const { mdns } = await import("@libp2p/mdns");

      const node = await createLibp2p({
        addresses: {
          listen: [`/ip4/0.0.0.0/tcp/${this.LIBP2P_PORT}`],
        },
        transports: [tcp()],
        streamMuxers: [yamux()],
        connectionEncrypters: [noise()],
        peerDiscovery: [
          mdns({
            interval: 1000, // Announce every 1 second
          }),
        ],
      });

      // Set up peer event listeners
      node.addEventListener("peer:connect", (event: any) => {
        const peerId = event.detail?.toString() ?? String(event.detail);
        this.context.emit("log", { level: "info", message: `P2P Connected to peer: ${peerId}` });
      });

      node.addEventListener("peer:disconnect", (event: any) => {
        const peerId = event.detail?.toString() ?? String(event.detail);
        this.context.emit("log", { level: "info", message: `P2P Disconnected from peer: ${peerId}` });
      });

      await node.start();

      // Register P2P protocol handler for Guardian API
      node.handle("/guardian-api/1.0.0", async (incoming: any) => {
        try {
          // Wrapped stream for unified interaction
          const stream: NetworkStream = wrapStream(incoming.stream || incoming);
          
          // Read request: accumulate data until newline
          let buffer = Buffer.alloc(0);
          let requestText: string | null = null;

          while (true) {
            const chunk = await stream.read();
            if (chunk === null) break; // EOF
            buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
            const newlineIndex = buffer.indexOf(10); // '\n'
            if (newlineIndex !== -1) {
              requestText = buffer.toString("utf8", 0, newlineIndex);
              break;
            }
          }

          if (!requestText) {
            await stream.write(Buffer.from(JSON.stringify({ success: false, error: "Invalid request" }) + "\n"));
            await stream.close();
            return;
          }

          let response: P2PResponse;

          try {
            const request = JSON.parse(requestText) as P2PRequest;
            response = await this.handleP2PRequest(request);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
            response = { success: false, error: errorMessage };
          }

          // Write response as JSON with newline
          const responseBuffer = Buffer.from(JSON.stringify(response) + "\n");
          await stream.write(responseBuffer);
          await stream.close();
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.context.emit("log", { level: "error", message: `Error handling P2P request: ${message}` });
        }
      });

      this.libp2pNode = node;

      this.context.emit("log", { level: "info", message: "=".repeat(60) });
      this.context.emit("log", { level: "info", message: "Libp2p node started" });
      this.context.emit("log", { level: "info", message: `Node ID: ${node.peerId.toString()}` });
      this.context.emit("log", { level: "info", message: "Listening on:" });
      
      node.getMultiaddrs().forEach((ma) => {
        const addr = ma.toString();
        if (addr.includes("127.0.0.1")) {
          this.context.emit("log", { level: "info", message: `  - ${addr} (Local)` });
        } else {
          this.context.emit("log", { level: "info", message: `  - ${addr} (Network - Use this for Discovery!)` });
        }
      });
      
      this.context.emit("log", { level: "info", message: "=".repeat(60) });
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      this.context.emit("log", { level: "error", message: `Failed to start libp2p node: ${err.message}` });
      if (err.code === "MODULE_NOT_FOUND" || err.message?.includes("Cannot find module")) {
        this.context.emit("log", { level: "info", message: "Note: Install libp2p packages to enable P2P: bun add libp2p @libp2p/tcp @chainsafe/libp2p-yamux @chainsafe/libp2p-noise @libp2p/mdns" });
      }
    }
  }

  private async handleP2PRequest(request: P2PRequest): Promise<P2PResponse> {
    switch (request.method) {
      case "write": {
        const command = request.params.command;
        this.context.emit("server:write", command);
        return { success: true, result: { message: "Command sent" } };
      }

      case "write-batch": {
        const commands = request.params.commands;
        for (const cmd of commands) {
          this.context.emit("server:write", cmd);
        }
        return { success: true, result: { message: `${commands.length} commands sent` } };
      }

      case "server:start":
        this.context.emit("server:start", {});
        return { success: true, result: { message: "Server start signal sent" } };

      case "server:stop":
        this.context.emit("server:stop", {});
        return { success: true, result: { message: "Server stop signal sent" } };

      case "server:restart":
        this.context.emit("server:restart", {});
        return { success: true, result: { message: "Server restart signal sent" } };

      case "backup:create":
        this.context.emit("backup:create", {});
        return { success: true, result: { message: "Backup trigger sent" } };

      case "tunnel:restart":
        this.context.emit("tunnel:restart", {});
        return { success: true, result: { message: "Tunnel restart signal sent" } };

      case "status":
        return {
          success: true,
          result: {
            status: "active",
            version: this.version,
            libp2p: this.libp2pNode ? "enabled" : "disabled",
            peerId: this.libp2pNode?.peerId?.toString(),
          },
        };

      default:
        return { success: false, error: `Unknown method: ${(request as { method: string }).method}` };
    }
  }

  private startServer(): void {
    const port = this.PORT;
    const self = this;

    this.server = Bun.serve({
      port,
      fetch(req, server) {
        const url = new URL(req.url);

        // Upgrade to WebSocket
        if (url.pathname === "/ws") {
          const success = server.upgrade(req, { data: undefined });
          return success ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
        }

        // --- HTTP API ---
        if (req.method === "POST") {
          return self.handlePostRequest(url.pathname, req);
        }

        // Health check / Status
        if (url.pathname === "/status") {
          return Response.json({
            status: "active",
            version: self.version,
            libp2p: self.libp2pNode ? "enabled" : "disabled",
            peerId: self.libp2pNode?.peerId?.toString(),
          });
        }

        // P2P connection info
        if (url.pathname === "/p2p/peers" && self.libp2pNode) {
          const peers = self.libp2pNode.getPeers();
          return Response.json({
            peers: peers.map((p: { toString(): string }) => p.toString()),
            count: peers.length,
          });
        }

        return new Response("Not Found", { status: 404 });
      },
      websocket: {
        open(ws) {
          self.sockets.add(ws);
          ws.send(JSON.stringify({ type: "connected", message: "Welcome to Guardian API" }));
        },
        message(ws, message) {
          try {
            const data = JSON.parse(String(message)) as unknown;
            self.handleWsMessage(ws, data);
          } catch (e) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
          }
        },
        close(ws) {
          self.sockets.delete(ws);
        },
      },
    });

    this.context.emit("log", { level: "info", message: `API Server started on http://localhost:${port}` });
  }

  private async handlePostRequest(path: string, req: Request): Promise<Response> {
    try {
      const body = await req.json();

      switch (path) {
        case "/write": {
          const result = ApiSchemas.write(body);
          if (result instanceof type.errors) {
            return Response.json({ success: false, error: result.summary }, { status: 400 });
          }
          this.context.emit("server:write", result.command);
          return Response.json({ success: true, message: "Command sent" });
        }

        case "/write-batch": {
          const result = ApiSchemas.writeBatch(body);
          if (result instanceof type.errors) {
            return Response.json({ success: false, error: result.summary }, { status: 400 });
          }
          for (const cmd of result.commands) {
            this.context.emit("server:write", cmd);
          }
          return Response.json({ success: true, message: `${result.commands.length} commands sent` });
        }

        case "/server/start":
          this.context.emit("server:start", {});
          return Response.json({ success: true, message: "Server start signal sent" });

        case "/server/stop":
          this.context.emit("server:stop", {});
          return Response.json({ success: true, message: "Server stop signal sent" });

        case "/server/restart":
          this.context.emit("server:restart", {});
          return Response.json({ success: true, message: "Server restart signal sent" });

        case "/backup/create":
          this.context.emit("backup:create", {});
          return Response.json({ success: true, message: "Backup trigger sent" });

        case "/tunnel/restart":
          this.context.emit("tunnel:restart", {});
          return Response.json({ success: true, message: "Tunnel restart signal sent" });
      }

      return Response.json({ success: false, error: "Invalid path or payload" }, { status: 400 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "An unknown error occurred";
      return Response.json({ success: false, error: message }, { status: 500 });
    }
  }

  private handleWsMessage(ws: ServerWebSocket<undefined>, data: unknown): void {
    const result = ApiSchemas.wsCommand(data);
    if (!(result instanceof type.errors)) {
      this.context.emit("server:write", result.command);
      ws.send(JSON.stringify({ type: "response", message: `Command '${result.command}' executed` }));
    } else {
      ws.send(JSON.stringify({ type: "error", message: "Invalid command format" }));
    }
  }

  private setupEventListeners(): void {
    // Broadcast server output to all connected WebSockets
    this.context.on("output", (line) => {
      this.broadcast({ type: "output", data: line });
    });

    this.context.on("log", (msg) => {
      this.broadcast({ type: "log", data: msg });
    });

    this.context.on("status", (status) => {
      this.broadcast({ type: "status", data: status });
    });
  }

  private broadcast(data: Record<string, unknown>): void {
    const message = JSON.stringify(data);
    for (const ws of this.sockets) {
      ws.send(message);
    }
  }
}

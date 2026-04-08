import { type IPlugin, type PluginContext } from "bun_plugins";
import { ApiSchemas } from "../src/utils/parsejson";
import { type Server, type ServerWebSocket } from "bun";

// WS API Request/Response types
type WSRequest = 
  | { method: "write"; params: { command: string } }
  | { method: "write-batch"; params: { commands: string[] } }
  | { method: "server:start" | "server:stop" | "server:restart" | "backup:create" | "tunnel:restart" | "status"; params?: Record<string, unknown> };

type WSResponse<T = unknown> =
  | { success: true; result: T }
  | { success: false; error: string };

/**
 * API Plugin that provides a REST and WebSocket interface for server control.
 * Uses Bun.serve and Bun WebSocket features.
 */
export class ApiPlugin implements IPlugin {
  name = "api-control";
  version = "1.0.0";
  description = "Provides Web and WebSocket API for server control and monitoring";
  author = "Guardian Team";

  private context!: PluginContext;
  private server: Server<undefined> | null = null;
  private sockets = new Set<ServerWebSocket<undefined>>();

  // Environment configuration
  private readonly PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3000;

  onLoad(context: PluginContext): void {
    this.context = context;
    this.startServer();
    this.setupEventListeners();
    
  }

  async onUnload(): Promise<void> {
    if (this.server) {
      this.server.stop();
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
          if (!result.success) {
            return Response.json({ success: false, error: result.error }, { status: 400 });
          }
          this.context.emit("server:write", result.data.command);
          return Response.json({ success: true, message: "Command sent" });
        }

        case "/write-batch": {
          const result = ApiSchemas.writeBatch(body);
          if (!result.success) {
            return Response.json({ success: false, error: result.error }, { status: 400 });
          }
          for (const cmd of result.data.commands) {
            this.context.emit("server:write", cmd);
          }
          return Response.json({ success: true, message: `${result.data.commands.length} commands sent` });
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
    if (result.success) {
      this.context.emit("server:write", result.data.command);
      ws.send(JSON.stringify({ type: "response", message: `Command '${result.data.command}' executed` }));
    } else {
      ws.send(JSON.stringify({ type: "error", message: result.error }));
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

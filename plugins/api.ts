import { type IPlugin, type PluginContext } from "bun_plugins";
import { ApiSchemas } from "../src/utils/parsejson";
import { type Server, type ServerWebSocket } from "bun";
import { ApiRouter, ApiRequest } from "../src/utils/api-handler";
import index from "./web/index.html"
/**
 * API Plugin that provides a REST and WebSocket interface for server control.
 * Uses a framework-like router for better organization and scalability.
 */
export class ApiPlugin implements IPlugin {
  name = "api-control";
  version = "1.0.0";
  description = "Provides Web and WebSocket API for server control and monitoring";
  author = "Guardian Team";

  private context!: PluginContext;
  private server: Server<undefined> | null = null;
  private sockets = new Set<ServerWebSocket<undefined>>();
  private router: ApiRouter = new ApiRouter();

  // Environment configuration
  private PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 9091;

  async onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    const {storage} = context;
    const serverPort = await storage.get("PORT", this.PORT);
    if (serverPort && !isNaN(serverPort) && serverPort !== this.PORT) {
      this.PORT = serverPort;
    } else {
      await storage.set("PORT", this.PORT);
    }

    this.setupRoutes();
    this.startServer();
    this.setupEventListeners();
  }

  async onUnload(): Promise<void> {
    if (this.server) {
      this.server.stop();
    }
  }

  private setupRoutes(): void {
    // Middleware for logging requests
    this.router.use((ctx) => {
      this.context.emit("log", { 
        level: "info", 
        message: `API Request: ${ctx.req.method} ${ctx.url.pathname}` 
      });
    });

    // Health check / Status
    this.router.get("/status", () => {
      return ApiRequest.json({
        status: "active",
        version: this.version,
      });
    });

    // --- Command Endpoints ---

    this.router.post("/write", async (ctx) => {
      this.context.emit("server:write", ctx.body.command);
      return ApiRequest.success("Command sent");
    }, ApiRouter.validateBody(ApiSchemas.write));

    this.router.post("/write-batch", async (ctx) => {
      for (const cmd of ctx.body.commands) {
        this.context.emit("server:write", cmd);
      }
      return ApiRequest.success(`${ctx.body.commands.length} commands sent`);
    }, ApiRouter.validateBody(ApiSchemas.writeBatch));

    // --- Server Control Endpoints ---

    this.router.post("/server/start", () => {
      this.context.emit("server:start", {});
      return ApiRequest.success("Server start signal sent");
    });

    this.router.post("/server/stop", () => {
      this.context.emit("server:stop", {});
      return ApiRequest.success("Server stop signal sent");
    });

    this.router.post("/server/restart", () => {
      this.context.emit("server:restart", {});
      return ApiRequest.success("Server restart signal sent");
    });

    // --- Other Endpoints ---

    this.router.post("/backup/create", () => {
      this.context.emit("backup:create", {});
      return ApiRequest.success("Backup trigger sent");
    });

    this.router.post("/tunnel/restart", () => {
      this.context.emit("tunnel:restart", {});
      return ApiRequest.success("Tunnel restart signal sent");
    });
  }

  private startServer(): void {
    const port = this.PORT;
    const self = this;

    this.server = Bun.serve({
      port,
      async fetch(req, server) {
        const url = new URL(req.url);

        // Upgrade to WebSocket
        if (url.pathname === "/ws") {
          const success = server.upgrade(req, { data: undefined });
          return success ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Handle with router
        const response = await self.router.handle(req, server);
        
        if (response) return response;

        return new Response("Not Found", { status: 404 });
      },
      routes: {
        "/": index
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

    this.context.log.info(`API Server started on http://localhost:${port}`);
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

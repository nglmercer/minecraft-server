import { type IPlugin, type PluginContext } from "bun_plugins";
import { ApiSchemas } from "../src/utils/parsejson";
import { type Server, type ServerWebSocket } from "bun";
import { ApiRouter, ApiRequest } from "../src/utils/api-handler";
import { Config } from "../src/services/config.service";
import { BackupManager } from "../src/utils/backup-manager";
import { PropertiesManager } from "../src/utils/properties-manager";
import { join } from "node:path";

/**
 * API Plugin that provides a REST and WebSocket interface for server control.
 * Uses a framework-like router for better organization and scalability.
 */
let lastRequest: string = "";

export class ApiPlugin implements IPlugin {
  name = "api-control";
  version = "1.0.0";
  description = "Provides Web and WebSocket API for server control and monitoring";
  author = "Guardian Team";

  private context!: PluginContext;
  private server: Server<any> | null = null;
  private sockets = new Set<ServerWebSocket<any>>();
  private router: ApiRouter = new ApiRouter();
  private logHistory: Array<{ type: string; data: any }> = [];
  private readonly MAX_HISTORY = 200;

  private backupManager!: BackupManager;
  private propertiesManager!: PropertiesManager;
  private currentStatus: string = "OFFLINE";

  // Environment configuration
  private PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 9091;

  async onLoad(context: PluginContext): Promise<void> {
    this.context = context;

    const config = Config.getInstance();
    config.loadSync();
    this.backupManager = new BackupManager({
      backupsDir: config.paths.backups,
      serverDir: config.server.cwd,
    });
    this.propertiesManager = new PropertiesManager(config.server.cwd);

    const { storage } = context;
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
      await this.server.stop();
    }
  }

  private setupRoutes(): void {
    // Middleware for logging requests
    this.router.use((ctx) => {
      const currentRequest = `${ctx.req.method} ${ctx.url.pathname}`;
      if (lastRequest === currentRequest) {
        return;
      }
      lastRequest = currentRequest;
      this.context.emit("log", {
        level: "info",
        message: `API Request: ${currentRequest}`
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

    this.router.get("/backups", async () => {
      const backups = await this.backupManager.listBackups();
      return ApiRequest.success("Backups fetched", { data: backups });
    });

    this.router.get("/backup/download/:name", async (ctx) => {
      const name = ctx.params.name;
      if (!name) return ApiRequest.error("Backup name is required", 400);
      return await this.backupManager.createDownloadResponse(name);
    });

    this.router.post(
      "/backup/restore",
      async (ctx) => {
        const name = ctx.body.name;

        this.context.emit("log", {
          level: "warn",
          message: `Restore requested: ${name}`,
        });

        // Wait for server to stop if it's not offline
        if (this.currentStatus !== "OFFLINE") {
          this.context.emit("log", { level: "info", message: "Stopping server for restore..." });

          const offlinePromise = new Promise<void>((resolve) => {
            const listener = (status: any) => {
              if (status === "OFFLINE") {
                resolve();
              }
            };
            this.context.on("status", listener);
          });

          this.context.emit("server:stop", {});
          await offlinePromise;
        }

        const result = await this.backupManager.restoreBackup(name);

        this.context.emit("log", {
          level: "info",
          message: `Restore completed: ${name}`,
        });

        // Auto-restart after restore
        this.context.emit("server:start", {});

        return ApiRequest.success("Restore completed", { data: result });
      },
      ApiRouter.validateBody(ApiSchemas.backupRestore),
    );

    this.router.post("/backup/upload", async (ctx) => {
      const form = await ctx.req.formData();
      const file = form.get("file");
      const requestedNameRaw = form.get("name");
      const requestedName = typeof requestedNameRaw === "string" ? requestedNameRaw : undefined;

      if (!(file instanceof File)) {
        return ApiRequest.error("Missing file field 'file' (multipart/form-data)", 400);
      }

      const saved = await this.backupManager.uploadBackup(file, requestedName);
      return ApiRequest.success("Backup uploaded", { data: saved });
    });

    this.router.post("/tunnel/start", () => {
      this.context.emit("tunnel:start", {});
      return ApiRequest.success("Tunnel start signal sent");
    });

    this.router.post("/tunnel/stop", () => {
      this.context.emit("tunnel:stop", {});
      return ApiRequest.success("Tunnel stop signal sent");
    });

    this.router.post("/tunnel/restart", () => {
      this.context.emit("tunnel:restart", {});
      return ApiRequest.success("Tunnel restart signal sent");
    });

    // --- Properties Endpoints ---

    this.router.get("/properties", async () => {
      try {
        const props = await this.propertiesManager.getProperties();
        return ApiRequest.success("Properties fetched", { data: props });
      } catch (e) {
        return ApiRequest.error(`Failed to read properties: ${e}`);
      }
    });

    this.router.post("/properties", async (ctx) => {
      try {
        const updates = await ctx.json();
        await this.propertiesManager.updateProperties(updates);
        return ApiRequest.success("Properties updated successfully");
      } catch (e) {
        return ApiRequest.error(`Failed to update properties: ${e}`);
      }
    });
  }

  private startServer(): void {
    const port = this.PORT;
    const self = this;
    const webDir = join(import.meta.dir, "web");

    this.server = Bun.serve({
      port,
      async fetch(req, server) {
        const url = new URL(req.url);

        // Serve Static UI
        if (url.pathname === "/" || url.pathname === "/index.html") {
          const file = Bun.file(join(webDir, "index.html"));
          if (await file.exists()) return new Response(file);
        }

        if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".html")) {
          const filePath = join(webDir, url.pathname);
          const file = Bun.file(filePath);
          if (await file.exists()) return new Response(file);
        }

        // Upgrade to WebSocket
        if (url.pathname === "/ws" || url.pathname === "/ws/") {
          const success = server.upgrade(req);
          if (success) return undefined;
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Handle with router
        const response = await self.router.handle(req, server);
        if (response) return response;

        return new Response("Not Found", { status: 404 });
      },
      websocket: {
        open(ws) {
          self.sockets.add(ws);
          ws.send(JSON.stringify({ type: "connected", message: "Welcome to Guardian API" }));

          // Send log history to new client
          if (self.logHistory.length > 0) {
            ws.send(JSON.stringify({ type: "history", data: self.logHistory }));
          }
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
      const msg = { type: "output", data: line };
      this.addToHistory(msg);
      this.broadcast(msg);
    });

    this.context.on("log", (msg) => {
      const logMsg = { type: "log", data: msg };
      this.addToHistory(logMsg);
      this.broadcast(logMsg);
    });

    this.context.on("status", (status) => {
      this.currentStatus = status as string;
      this.broadcast({ type: "status", data: status });
    });
  }

  private addToHistory(msg: { type: string; data: any }): void {
    this.logHistory.push(msg);
    if (this.logHistory.length > this.MAX_HISTORY) {
      this.logHistory.shift();
    }
  }

  private broadcast(data: Record<string, unknown>): void {
    const message = JSON.stringify(data);
    for (const ws of this.sockets) {
      ws.send(message);
    }
  }
}


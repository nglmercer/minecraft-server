import { type IPlugin, type PluginContext } from "bun_plugins";
import { Config } from "../src/services/config.service";
import { ApiSchemas } from "../src/utils/parsejson";
import { type } from "arktype";

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
  private server: any;
  private sockets = new Set<any>();

  onLoad(context: PluginContext): void {
    this.context = context;
    this.startServer();
    this.setupEventListeners();
  }

  onUnload(): void {
    if (this.server) {
      this.server.stop();
    }
  }

  private startServer(): void {
    const port = 3000; // Podrías hacerlo configurable via config.yaml
    const self = this;

    this.server = Bun.serve({
      port,
      fetch(req, server) {
        const url = new URL(req.url);
        
        // Upgrade to WebSocket
        if (url.pathname === "/ws") {
          const success = server.upgrade(req);
          return success ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
        }

        // --- HTTP API ---
        if (req.method === "POST") {
          return self.handlePostRequest(url.pathname, req);
        }

        // Health check / Status
        if (url.pathname === "/status") {
          return Response.json({ status: "active", version: self.version });
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
            const data = JSON.parse(String(message));
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
          this.context.emit("server:write" as any, result.command);
          return Response.json({ success: true, message: "Command sent" });
        }

        case "/write-batch": {
          const result = ApiSchemas.writeBatch(body);
          if (result instanceof type.errors) {
            return Response.json({ success: false, error: result.summary }, { status: 400 });
          }
          for (const cmd of result.commands) {
            this.context.emit("server:write" as any, cmd);
          }
          return Response.json({ success: true, message: `${result.commands.length} commands sent` });
        }

        case "/server/start":
          this.context.emit("server:start" as any, {});
          return Response.json({ success: true, message: "Server start signal sent" });

        case "/server/stop":
          this.context.emit("server:stop" as any, {});
          return Response.json({ success: true, message: "Server stop signal sent" });

        case "/server/restart":
          this.context.emit("server:restart" as any, {});
          return Response.json({ success: true, message: "Server restart signal sent" });

        case "/backup/create":
          this.context.emit("backup:create" as any, {});
          return Response.json({ success: true, message: "Backup trigger sent" });

        case "/tunnel/restart":
          this.context.emit("tunnel:restart" as any, {});
          return Response.json({ success: true, message: "Tunnel restart signal sent" });
      }

      return Response.json({ success: false, error: "Invalid path or payload" }, { status: 400 });
    } catch (e: any) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  private handleWsMessage(ws: any, data: any): void {
    const result = ApiSchemas.wsCommand(data);
    if (!(result instanceof type.errors)) {
      this.context.emit("server:write" as any, result.command);
      ws.send(JSON.stringify({ type: "response", message: `Command '${result.command}' executed` }));
    } else {
      ws.send(JSON.stringify({ type: "error", message: "Invalid command format" }));
    }
  }

  private setupEventListeners(): void {
    // Broadcast server output to all connected WebSockets
    this.context.on("output" as any, (line: string) => {
      this.broadcast({ type: "output", data: line });
    });

    this.context.on("log" as any, (msg: any) => {
      this.broadcast({ type: "log", data: msg });
    });

    this.context.on("status" as any, (status: string) => {
      this.broadcast({ type: "status", data: status });
    });
  }

  private broadcast(data: any): void {
    const message = JSON.stringify(data);
    for (const ws of this.sockets) {
      ws.send(message);
    }
  }
}

import { type ServerWebSocket } from "bun";

/**
 * Custom request context to simplify handling
 */
export class ApiRequest {
  public readonly url: URL;
  public params: Record<string, string> = {};
  public body: any = null;

  constructor(
    public readonly req: Request,
    public readonly path: string,
    public readonly server?: any
  ) {
    this.url = new URL(req.url);
  }

  async json<T = any>(): Promise<T> {
    if (this.body) return this.body as T;
    try {
      this.body = await this.req.json();
      return this.body as T;
    } catch (e) {
      throw new Error("Invalid JSON body");
    }
  }

  static json(data: any, status = 200): Response {
    return Response.json(data, { status });
  }

  static error(message: string, status = 400): Response {
    return Response.json({ success: false, error: message }, { status });
  }

  static success(message: string, data?: any): Response {
    return Response.json({ success: true, message, ...data }, { status: 200 });
  }
}

export type ApiMiddleware = (ctx: ApiRequest) => Promise<Response | void> | Response | void;
export type ApiHandler = (ctx: ApiRequest) => Promise<Response> | Response;

export interface Route {
  method: string;
  path: string;
  pathSegments: string[];
  handler: ApiHandler;
  middlewares: ApiMiddleware[];
}

/**
 * Advanced Router framework for Bun.serve
 */
export class ApiRouter {
  private routes: Route[] = [];
  private globalMiddlewares: ApiMiddleware[] = [];

  /**
   * Add global middleware
   */
  use(middleware: ApiMiddleware): this {
    this.globalMiddlewares.push(middleware);
    return this;
  }

  get(path: string, handler: ApiHandler, ...middlewares: ApiMiddleware[]): this {
    return this.addRoute("GET", path, handler, middlewares);
  }

  post(path: string, handler: ApiHandler, ...middlewares: ApiMiddleware[]): this {
    return this.addRoute("POST", path, handler, middlewares);
  }

  put(path: string, handler: ApiHandler, ...middlewares: ApiMiddleware[]): this {
    return this.addRoute("PUT", path, handler, middlewares);
  }

  delete(path: string, handler: ApiHandler, ...middlewares: ApiMiddleware[]): this {
    return this.addRoute("DELETE", path, handler, middlewares);
  }

  private addRoute(method: string, path: string, handler: ApiHandler, middlewares: ApiMiddleware[]): this {
    // Remove leading and trailing slashes for easier segmentation
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const pathSegments = cleanPath === "" ? [] : cleanPath.split("/");
    
    this.routes.push({ method, path, pathSegments, handler, middlewares });
    return this;
  }

  async handle(req: Request, server?: any): Promise<Response | undefined> {
    const url = new URL(req.url);
    const method = req.method;
    const cleanActualPath = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
    const actualSegments = cleanActualPath === "" ? [] : cleanActualPath.split("/");

    // Find matching route with parameter support
    let matchingRoute: Route | undefined;
    const params: Record<string, string> = {};

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.pathSegments.length !== actualSegments.length) continue;

      let match = true;
      const currentParams: Record<string, string> = {};

      for (let i = 0; i < route.pathSegments.length; i++) {
        const routeSegment = route.pathSegments[i];
        const actualSegment = actualSegments[i];

        if (routeSegment && routeSegment.startsWith(":")) {
          currentParams[routeSegment.slice(1)] = decodeURIComponent(actualSegment || "");
        } else if (routeSegment !== actualSegment) {
          match = false;
          break;
        }
      }

      if (match) {
        matchingRoute = route;
        Object.assign(params, currentParams);
        break;
      }
    }

    if (!matchingRoute) return undefined;

    const ctx = new ApiRequest(req, url.pathname, server);
    ctx.params = params;
    
    try {
      // Apply global middlewares
      for (const middleware of this.globalMiddlewares) {
        const response = await middleware(ctx);
        if (response instanceof Response) return response;
      }

      // Apply route-specific middlewares
      for (const middleware of matchingRoute.middlewares) {
        const response = await middleware(ctx);
        if (response instanceof Response) return response;
      }

      // Execute handler
      return await matchingRoute.handler(ctx);
    } catch (e: any) {
      return ApiRequest.error(e.message || "Internal Server Error", 500);
    }
  }

  /**
   * Helper to create a validation middleware
   */
  static validateBody<T>(validator: (data: any) => { success: boolean; data?: T; error?: string }): ApiMiddleware {
    return async (ctx) => {
      try {
        const body = await ctx.json();
        const result = validator(body);
        if (!result.success) {
          return ApiRequest.error(result.error || "Validation failed", 400);
        }
        // Replace body with validated data
        ctx.body = result.data;
      } catch (e: any) {
        return ApiRequest.error(e.message || "Invalid body", 400);
      }
    };
  }
}

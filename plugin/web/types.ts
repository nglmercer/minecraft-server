export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface ServerStatus {
    status: string;
    version: string;
}

export type LogLevel = 'info' | 'error' | 'warn' | 'output';

export interface LogEntry {
    time: string;
    message: string;
    type: LogLevel;
}

export type WsIncomingMessage = 
    | { type: 'output'; data: string }
    | { type: 'log'; data: { level?: string; message: string } | string }
    | { type: 'status'; data: string }
    | { type: 'error'; message: string }
    | { type: 'history'; data: Array<{ type: string; data: any }> };

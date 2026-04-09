import { render } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import Header from "./components/Header.tsx";
import Console from "./components/Console.tsx";
import Controls from "./components/Controls.tsx";
import type { ApiResponse, ServerStatus, LogLevel, LogEntry, WsIncomingMessage } from "./types.ts";

const App = () => {
    const [status, setStatus] = useState<string>('disconnected');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [version, setVersion] = useState<string>('1.0.0');

    const wsRef = useRef<WebSocket | null>(null);

    const apiCall = async <T,>(path: string, method: string = 'GET', body?: unknown): Promise<ApiResponse<T>> => {
        try {
            const response = await fetch(path, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined
            });
            return (await response.json()) as ApiResponse<T>;
        } catch (error) {
            console.error(`API Call failed: ${path}`, error);
            return { success: false, error: String(error) };
        }
    };

    const updateStatus = async () => {
        const response = await apiCall<ServerStatus>('/status');
        if (response.success && response.data) {
            setStatus(response.data.status);
            setVersion(response.data.version);
        } else {
            //setStatus('disconnected');
        }
    };

    const appendLog = (message: string, type: LogLevel = 'output') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => {
            const newLogs = [...prev, { time, message, type }];
            return newLogs.length > 200 ? newLogs.slice(1) : newLogs;
        });
    };

    const connectWS = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            appendLog('Connected to WebSocket server', 'info');
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as WsIncomingMessage;
                
                if (msg.type === 'output') {
                    appendLog(msg.data, 'output');
                } else if (msg.type === 'log') {
                    if (typeof msg.data === 'string') {
                        appendLog(msg.data, 'output');
                    } else if (msg.data && typeof msg.data === 'object') {
                        const level = (msg.data.level || 'output') as LogLevel;
                        appendLog(msg.data.message, level);
                    }
                } else if (msg.type === 'status') {
                    updateStatus();
                } else if (msg.type === 'error') {
                    appendLog(`Error: ${msg.message}`, 'error');
                }
            } catch (e) {
                appendLog(`Raw: ${event.data}`);
            }
        };

        ws.onclose = () => {
            appendLog('WebSocket connection closed. Retrying in 5s...', 'warn');
            //setStatus('disconnected');
            setTimeout(() => connectWS(), 5000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
        };
    };

    const sendCommand = async (command: string) => {
        appendLog(`> ${command}`, 'info');

        const result = await apiCall('/write', 'POST', { command });
        if (!result.success) {
            appendLog(`Failed to send command: ${result.error}`, 'error');
        }
    };

    const triggerAction = async (action: string) => {
        const result = await apiCall(`/server/${action}`, 'POST');
        if (result.success) {
            appendLog(`${action} command sent successfully`, 'info');
        } else {
            appendLog(`Failed to send ${action} command`, 'error');
        }
    };

    const triggerGenericAction = async (path: string, label: string) => {
        const result = await apiCall(path, 'POST');
        if (result.success) {
            appendLog(`${label} triggered`, 'info');
        } else {
            appendLog(`Failed to trigger ${label}: ${path}`, 'error');
        }
    };

    useEffect(() => {
        updateStatus();
        const statusInterval = setInterval(updateStatus, 10000);
        connectWS();

        return () => {
            clearInterval(statusInterval);
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    return (
        <div class="container">
            <Header version={version} status={status} />

            <main class="grid">
                <Console logs={logs} onSendCommand={sendCommand} />
                <Controls 
                    onTriggerAction={triggerAction} 
                    onTriggerGenericAction={triggerGenericAction} 
                />
            </main>
        </div>
    );
};

render(<App />, document.getElementById("app")!);

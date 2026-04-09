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
        }
    };

    const appendLog = (message: string, type: LogLevel = 'output') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => {
            const newLogs = [...prev, { time, message, type }];
            return newLogs.length > 200 ? newLogs.slice(1) : newLogs;
        });
    };

    const appendLogs = (entries: Array<{ message: string, type?: LogLevel }>) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => {
            const newEntries = entries.map(e => ({ 
                time, 
                message: e.message, 
                type: e.type || 'output' 
            }));
            const newLogs = [...prev, ...newEntries];
            return newLogs.length > 200 ? newLogs.slice(newLogs.length - 200) : newLogs;
        });
    };

    const connectWS = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setStatus('connected');
        ws.onopen = () => {
            appendLog('Connected to WebSocket server', 'info');
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as WsIncomingMessage;
                
                const processMessage = (m: { type: string, data?: any, message?: string }) => {
                    if (m.type === 'output') {
                        appendLog(m.data, 'output');
                    } else if (m.type === 'log') {
                        if (typeof m.data === 'string') {
                            appendLog(m.data, 'output');
                        } else if (m.data && typeof m.data === 'object') {
                            const level = (m.data.level || 'output') as LogLevel;
                            appendLog(m.data.message, level);
                        }
                    } else if (m.type === 'status') {
                        updateStatus();
                    } else if (m.type === 'error') {
                        appendLog(`Error: ${m.message}`, 'error');
                    }
                };

                if (msg.type === 'history') {
                    const entries = msg.data.map(m => {
                        if (m.type === 'output') return { message: m.data, type: 'output' as LogLevel };
                        if (m.type === 'log') {
                            if (typeof m.data === 'string') return { message: m.data, type: 'output' as LogLevel };
                            return { message: m.data.message, type: (m.data.level || 'output') as LogLevel };
                        }
                        return null;
                    }).filter(e => e !== null) as Array<{ message: string, type: LogLevel }>;
                    
                    appendLogs(entries);
                } else {
                    processMessage(msg);
                }
            } catch (e) {
                appendLog(`Raw: ${event.data}`);
            }
        };

        ws.onclose = () => {
            appendLog('WebSocket connection closed. Retrying in 5s...', 'warn');
            setStatus('disconnected');
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
                    apiCall={apiCall}
                />
            </main>
        </div>
    );
};

export default App;

render(<App />, document.getElementById("app")!);

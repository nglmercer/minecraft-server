import { type FunctionComponent } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import type { LogEntry } from "../types.ts";

interface ConsoleProps {
    logs: LogEntry[];
    onSendCommand: (command: string) => void;
}

const Console: FunctionComponent<ConsoleProps> = (props) => {
    const [commandInput, setCommandInput] = useState('');
    const consoleRef = useRef<HTMLDivElement>(null);

    const handleSubmit = (e: Event) => {
        e.preventDefault();
        const cmd = commandInput.trim();
        if (cmd) {
            props.onSendCommand(cmd);
            setCommandInput('');
        }
    };

    // Auto-scroll logic whenever logs change
    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [props.logs]);

    return (
        <section class="card console-container">
            <h2>Console</h2>
            <div class="console" ref={consoleRef}>
                {props.logs.map((log, index) => (
                    <div key={index} class="console-line">
                        <span class="line-time">[{log.time}]</span>
                        <span class={`line-${log.type}`}>{log.message}</span>
                    </div>
                ))}
            </div>
            <form class="command-input-container" onSubmit={handleSubmit}>
                <input 
                    type="text" 
                    placeholder="Type a command..." 
                    value={commandInput} 
                    onInput={(e) => setCommandInput(e.currentTarget.value)}
                />
                <button type="submit">Send</button>
            </form>
        </section>
    );
};

export default Console;

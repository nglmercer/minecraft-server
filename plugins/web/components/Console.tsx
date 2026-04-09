import { type Component, For, createSignal } from "solid-js";
import type { LogEntry } from "../types.ts";

interface ConsoleProps {
    logs: LogEntry[];
    onSendCommand: (command: string) => void;
}

const Console: Component<ConsoleProps> = (props) => {
    const [commandInput, setCommandInput] = createSignal('');
    let consoleRef: HTMLDivElement | undefined;

    const handleSubmit = (e: Event) => {
        e.preventDefault();
        const cmd = commandInput().trim();
        if (cmd) {
            props.onSendCommand(cmd);
            setCommandInput('');
        }
    };

    // Auto-scroll logic inside the component
    const scrollToBottom = () => {
        if (consoleRef) {
            consoleRef.scrollTop = consoleRef.scrollHeight;
        }
    };

    // We can use a simple effect for scrolling when logs change
    // but the parent might want to handle it too.
    // For now, let's just let the parent handle the ref or provide it.
    
    return (
        <section class="card console-container">
            <h2>Console</h2>
            <div class="console" ref={consoleRef}>
                <For each={props.logs}>
                    {(log) => (
                        <div class="console-line">
                            <span class="line-time">[{log.time}]</span>
                            <span class={`line-${log.type}`}>{log.message}</span>
                        </div>
                    )}
                </For>
            </div>
            <form class="command-input-container" onSubmit={handleSubmit}>
                <input 
                    type="text" 
                    placeholder="Type a command..." 
                    value={commandInput()} 
                    onInput={(e) => setCommandInput(e.currentTarget.value)}
                />
                <button type="submit">Send</button>
            </form>
        </section>
    );
};

export default Console;

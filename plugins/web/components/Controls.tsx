import { type Component } from "solid-js";

interface ControlsProps {
    onTriggerAction: (action: string) => void;
    onTriggerGenericAction: (path: string, label: string) => void;
}

const Controls: Component<ControlsProps> = (props) => {
    return (
        <aside class="controls">
            <div class="card">
                <h2>Server Controls</h2>
                <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
                    <button class="btn-start" onClick={() => props.onTriggerAction('start')}>Start Server</button>
                    <button class="btn-stop" onClick={() => props.onTriggerAction('stop')}>Stop Server</button>
                    <button class="btn-restart" onClick={() => props.onTriggerAction('restart')}>Restart Server</button>
                </div>
            </div>

            <div class="card">
                <h2>Maintenance</h2>
                <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
                    <button class="btn-backup" onClick={() => props.onTriggerGenericAction('/backup/create', 'Backup')}>Create Backup</button>
                    <button class="btn-tunnel" onClick={() => props.onTriggerGenericAction('/tunnel/restart', 'Tunnel Restart')}>Restart Tunnel</button>
                </div>
            </div>
        </aside>
    );
};

export default Controls;

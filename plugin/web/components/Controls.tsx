import { type FunctionComponent } from "preact";

interface ControlsProps {
    onTriggerAction: (action: string) => void;
    onTriggerGenericAction: (path: string, label: string) => void;
}

const Controls: FunctionComponent<ControlsProps> = (props) => {
    return (
        <aside class="controls">
            <div class="card">
                <h2>
                    <i class="fas fa-server"></i>
                    Server
                </h2>
                <div class="control-group">
                    <button 
                        class="btn-start" 
                        onClick={() => props.onTriggerAction('start')}
                        data-tooltip="Launch the Minecraft server"
                    >
                        <i class="fas fa-play"></i>
                        Start Server
                    </button>
                    
                    <button 
                        class="btn-stop" 
                        onClick={() => props.onTriggerAction('stop')}
                        data-tooltip="Gracefully stop the server"
                    >
                        <i class="fas fa-stop"></i>
                        Stop Server
                    </button>
                    
                    <button 
                        class="btn-restart" 
                        onClick={() => props.onTriggerAction('restart')}
                        data-tooltip="Restart the server process"
                    >
                        <i class="fas fa-rotate-right"></i>
                        Restart Server
                    </button>
                </div>
            </div>

            <div class="card">
                <h2>
                    <i class="fas fa-tools"></i>
                    Maintenance
                </h2>
                <div class="control-group">
                    <div>
                        <button 
                            class="btn-backup" 
                            style={{ width: "100%" }}
                            onClick={() => props.onTriggerGenericAction('/backup/create', 'Backup')}
                            data-tooltip="Create a manual backup of world data"
                        >
                            <i class="fas fa-file-zipper"></i>
                            Create Backup
                        </button>
                        <p class="hint-text">Last backup: Not tracked</p>
                    </div>

                    <div style={{ marginTop: "0.5rem" }}>
                        <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                            Tunnel (Playit.gg)
                        </h3>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button 
                                class="btn-start" 
                                style={{ flex: 1 }} 
                                onClick={() => props.onTriggerGenericAction('/tunnel/start', 'Tunnel Start')}
                                data-tooltip="Start the network tunnel"
                            >
                                <i class="fas fa-link"></i>
                                Start
                            </button>
                            <button 
                                class="btn-stop" 
                                style={{ flex: 1 }} 
                                onClick={() => props.onTriggerGenericAction('/tunnel/stop', 'Tunnel Stop')}
                                data-tooltip="Stop the network tunnel"
                            >
                                <i class="fas fa-link-slash"></i>
                                Stop
                            </button>
                        </div>
                    </div>
                    
                    <button 
                        class="btn-tunnel" 
                        onClick={() => props.onTriggerGenericAction('/tunnel/restart', 'Tunnel Restart')}
                        data-tooltip="Reconnect the network tunnel"
                    >
                        <i class="fas fa-arrows-rotate"></i>
                        Restart Tunnel
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default Controls;

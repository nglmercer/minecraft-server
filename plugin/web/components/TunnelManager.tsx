import { type FunctionComponent } from "preact";

interface TunnelManagerProps {
    onTriggerGenericAction: (path: string, label: string) => void;
}

const TunnelManager: FunctionComponent<TunnelManagerProps> = (props) => {
    return (
        <div class="card">
            <h2>
                <i class="fas fa-network-wired"></i>
                Tunnel (Playit.gg)
            </h2>
            <div class="control-group">
                <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
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
                
                <button 
                    class="btn-tunnel" 
                    style={{ width: "100%" }}
                    onClick={() => props.onTriggerGenericAction('/tunnel/restart', 'Tunnel Restart')}
                    data-tooltip="Reconnect the network tunnel"
                >
                    <i class="fas fa-arrows-rotate"></i>
                    Restart Tunnel
                </button>
            </div>
        </div>
    );
};

export default TunnelManager;

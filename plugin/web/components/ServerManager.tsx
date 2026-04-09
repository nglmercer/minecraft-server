import { type FunctionComponent } from "preact";

interface ServerManagerProps {
    onTriggerAction: (action: string) => void;
}

const ServerManager: FunctionComponent<ServerManagerProps> = (props) => {
    return (
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
    );
};

export default ServerManager;

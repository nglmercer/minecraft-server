import { type FunctionComponent } from "preact";

interface ServerManagerProps {
    onTriggerAction: (action: string) => void;
}

const ServerManager: FunctionComponent<ServerManagerProps> = (props) => {
    return (
        <div class="card">
            <h2>
                <span class="material-symbols-rounded">dns</span>
                Server
            </h2>
            <div class="control-group">
                <button 
                    class="btn-start" 
                    onClick={() => props.onTriggerAction('start')}
                    data-tooltip="Launch the Minecraft server"
                >
                    <span class="material-symbols-rounded">play_arrow</span>
                    Start Server
                </button>
                
                <button 
                    class="btn-stop" 
                    onClick={() => props.onTriggerAction('stop')}
                    data-tooltip="Gracefully stop the server"
                >
                    <span class="material-symbols-rounded">stop</span>
                    Stop Server
                </button>
                
                <button 
                    class="btn-restart" 
                    onClick={() => props.onTriggerAction('restart')}
                    data-tooltip="Restart the server process"
                >
                    <span class="material-symbols-rounded">refresh</span>
                    Restart Server
                </button>
            </div>
        </div>
    );
};

export default ServerManager;

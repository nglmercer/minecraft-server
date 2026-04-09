import { type FunctionComponent } from "preact";
import ServerManager from "./ServerManager.tsx";
import TunnelManager from "./TunnelManager.tsx";
import BackupManager from "./BackupManager.tsx";
import { type ApiResponse } from "../types.ts";

interface ControlsProps {
    onTriggerAction: (action: string) => void;
    onTriggerGenericAction: (path: string, label: string) => void;
    apiCall: <T>(path: string, method?: string, body?: unknown) => Promise<ApiResponse<T>>;
}

const Controls: FunctionComponent<ControlsProps> = (props) => {
    return (
        <aside class="controls">
            <ServerManager onTriggerAction={props.onTriggerAction} />
            <BackupManager 
                onTriggerGenericAction={props.onTriggerGenericAction} 
                apiCall={props.apiCall} 
            />
            <TunnelManager onTriggerGenericAction={props.onTriggerGenericAction} />
        </aside>
    );
};

export default Controls;

import { type FunctionComponent } from "preact";

interface HeaderProps {
    version: string;
    status: string;
}

const Header: FunctionComponent<HeaderProps> = (props) => {
    const getStatusClass = () => {
        switch (props.status.toLowerCase()) {
            case 'online':
            case 'active':
            case 'running':
                return 'status-active';
            case 'warning':
                return 'status-warning';
            default:
                return 'status-disconnected';
        }
    };

    return (
        <header class="header">
            <div style={{ display: "flex", "align-items": "center", gap: "1rem" }}>
                <div style={{ background: "var(--accent)", padding: "0.5rem", "border-radius": "0.5rem", display: "flex", "align-items": "center", "justify-content": "center" }}>
                    <i class="fas fa-shield-halved" style={{ color: "white", "font-size": "1.25rem" }}></i>
                </div>
                <div>
                    <h1 style={{ margin: 0, "font-size": "1.25rem", "font-weight": "800", "letter-spacing": "-0.025em" }}>Guardian Panel</h1>
                    <span style={{ color: "var(--text-secondary)", "font-size": "0.75rem", "font-weight": "500" }}>v{props.version}</span>
                </div>
            </div>
            
            <div class={`status-badge ${getStatusClass()}`}>
                <span class="status-dot"></span>
                {props.status}
            </div>
        </header>
    );
};

export default Header;

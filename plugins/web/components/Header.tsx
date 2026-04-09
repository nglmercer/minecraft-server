import { type Component } from "solid-js";

interface HeaderProps {
    version: string;
    status: string;
}

const Header: Component<HeaderProps> = (props) => {
    return (
        <header class="header">
            <div style={{ display: "flex", "align-items": "baseline", gap: "1rem" }}>
                <h1 style={{ margin: 0, "font-size": "1.5rem" }}>Guardian Panel</h1>
                <span style={{ color: "var(--text-secondary)", "font-size": "0.875rem" }}>v{props.version}</span>
            </div>
            <div class={`status-badge status-${props.status}`}>
                {props.status}
            </div>
        </header>
    );
};

export default Header;

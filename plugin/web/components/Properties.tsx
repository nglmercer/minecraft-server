import { useState, useEffect } from "preact/hooks";
import type { ApiResponse } from "../types.ts";

interface PropertiesProps {
    apiCall: <T>(path: string, method?: string, body?: unknown) => Promise<ApiResponse<T>>;
    appendLog: (message: string, type?: "info" | "error" | "warn" | "output") => void;
}

const Properties = ({ apiCall, appendLog }: PropertiesProps) => {
    const [properties, setProperties] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [filter, setFilter] = useState("");

    const fetchProperties = async () => {
        setLoading(true);
        const response = await apiCall<Record<string, any>>("/properties");
        if (response.success && response.data) {
            setProperties(response.data);
        } else {
            appendLog(`Failed to fetch properties: ${response.error}`, "error");
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        const response = await apiCall("/properties", "POST", properties);
        if (response.success) {
            appendLog("Properties saved successfully", "info");
        } else {
            appendLog(`Failed to save properties: ${response.error}`, "error");
        }
        setSaving(false);
    };

    const handlePropertyChange = (key: string, value: any) => {
        setProperties(prev => ({ ...prev, [key]: value }));
    };

    useEffect(() => {
        fetchProperties();
    }, []);

    const filteredKeys = Object.keys(properties).filter(key => 
        key.toLowerCase().includes(filter.toLowerCase())
    );

    if (loading) {
        return (
            <div class="card glass animate-pulse">
                <div class="card-header">
                    <h2>Loading Properties...</h2>
                </div>
            </div>
        );
    }

    return (
        <div class="card glass">
            <div class="card-header properties-header">
                <h2>Server Properties</h2>
                <div class="header-actions">
                    <input 
                        type="text" 
                        placeholder="Filter properties..." 
                        class="input filter-input"
                        value={filter}
                        onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
                    />
                    <button 
                        class="btn btn-primary" 
                        onClick={handleSave}
                        disabled={saving}
                    >
                        <span class={`material-symbols-rounded ${saving ? 'fa-spin' : ''}`}>{saving ? 'sync' : 'save'}</span>
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button 
                        class="btn" 
                        onClick={fetchProperties}
                        disabled={saving}
                    >
                        <span class="material-symbols-rounded">sync</span>
                        Refresh
                    </button>
                </div>
            </div>
            <div class="properties-list">
                {filteredKeys.length === 0 ? (
                    <p style={{ textAlign: 'center', opacity: 0.6, padding: '2rem' }}>No properties found matching your filter.</p>
                ) : (
                    <table class="properties-table">
                        <thead>
                            <tr>
                                <th>Property</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredKeys.map(key => (
                                <tr key={key}>
                                    <td class="property-key">{key}</td>
                                    <td class="property-value">
                                        {typeof properties[key] === 'boolean' ? (
                                            <label class="switch">
                                                <input 
                                                    type="checkbox" 
                                                    checked={properties[key]} 
                                                    onChange={(e) => handlePropertyChange(key, (e.target as HTMLInputElement).checked)}
                                                />
                                                <span class="slider round"></span>
                                            </label>
                                        ) : (
                                            <input 
                                                type={typeof properties[key] === 'number' ? "number" : "text"} 
                                                class="input"
                                                value={properties[key]}
                                                onInput={(e) => handlePropertyChange(key, (e.target as HTMLInputElement).value)}
                                            />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default Properties;

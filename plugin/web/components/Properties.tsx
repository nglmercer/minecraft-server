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
            <div class="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Server Properties</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                        type="text" 
                        placeholder="Filter properties..." 
                        class="input"
                        style={{ width: '200px' }}
                        value={filter}
                        onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
                    />
                    <button 
                        class="btn btn-primary" 
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button 
                        class="btn" 
                        onClick={fetchProperties}
                        disabled={saving}
                    >
                        Refresh
                    </button>
                </div>
            </div>
            <div class="properties-list" style={{ maxHeight: '600px', overflowY: 'auto', padding: '15px' }}>
                {filteredKeys.length === 0 ? (
                    <p style={{ textAlign: 'center', opacity: 0.6 }}>No properties found matching your filter.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '10px' }}>Property</th>
                                <th style={{ padding: '10px' }}>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredKeys.map(key => (
                                <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '8px 10px', fontSize: '0.9rem', opacity: 0.8 }}>{key}</td>
                                    <td style={{ padding: '8px 10px' }}>
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
                                                style={{ width: '100%', padding: '4px 8px' }}
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

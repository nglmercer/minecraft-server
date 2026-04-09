import { type FunctionComponent } from "preact";
import { useState, useEffect } from "preact/hooks";
import { type ApiResponse, type BackupEntry } from "../types.ts";

interface BackupManagerProps {
    onTriggerGenericAction: (path: string, label: string) => void;
    apiCall: <T>(path: string, method?: string, body?: unknown) => Promise<ApiResponse<T>>;
}

const BackupManager: FunctionComponent<BackupManagerProps> = (props) => {
    const [backups, setBackups] = useState<BackupEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const fetchBackups = async () => {
        setLoading(true);
        const res = await props.apiCall<BackupEntry[]>('/backups');
        if (res.success && res.data) {
            setBackups(res.data);
        }
        setLoading(false);
    };

    const handleRestore = async (name: string) => {
        if (!confirm(`Are you sure you want to restore ${name}? This will stop the server and overwrite current data.`)) {
            return;
        }
        setLoading(true);
        const res = await props.apiCall('/backup/restore', 'POST', { name });
        if (res.success) {
            alert('Restore completed successfully!');
        } else {
            alert(`Restore failed: ${res.error}`);
        }
        setLoading(false);
    };

    const handleDownload = (name: string) => {
        window.open(`/backup/download/${encodeURIComponent(name)}`, '_blank');
    };

    const handleUpload = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/backup/upload', {
                method: 'POST',
                body: formData
            });
            const res = await response.json() as ApiResponse<BackupEntry>;
            if (res.success) {
                fetchBackups();
            } else {
                alert(`Upload failed: ${res.error}`);
            }
        } catch (err) {
            alert(`Upload failed: ${err}`);
        } finally {
            setUploading(false);
            target.value = '';
        }
    };

    const handleCreate = async () => {
        await props.onTriggerGenericAction('/backup/create', 'Backup');
        // Give it a moment to finish before refreshing
        setTimeout(fetchBackups, 3000);
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div class="card">
            <h2>
                <i class="fas fa-file-zipper"></i>
                Backups
            </h2>
            <div class="control-group">
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <button 
                        class="btn-backup" 
                        style={{ flex: 1 }}
                        onClick={handleCreate}
                        disabled={loading}
                    >
                        <i class="fas fa-plus"></i>
                        Create
                    </button>
                    <button 
                        class="btn-restart" 
                        style={{ flex: 1 }}
                        onClick={fetchBackups}
                        disabled={loading}
                    >
                        <i class={`fas fa-sync ${loading ? 'fa-spin' : ''}`}></i>
                        Refresh
                    </button>
                </div>

                <div class="upload-area" style={{ marginBottom: "0.5rem" }}>
                    <label class="btn-start" style={{ display: "block", textAlign: "center", cursor: "pointer", opacity: uploading ? 0.5 : 1 }}>
                        <i class={`fas ${uploading ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>
                        {uploading ? ' Uploading...' : ' Upload Backup (.tar.gz)'}
                        <input type="file" accept=".tar.gz" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
                    </label>
                </div>

                <div class="backup-list" style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "4px", padding: "0.25rem" }}>
                    {backups.length === 0 ? (
                        <p class="hint-text" style={{ textAlign: "center", padding: "1rem" }}>No backups found</p>
                    ) : (
                        backups.map(b => (
                            <div key={b.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", borderBottom: "1px solid var(--border)", fontSize: "0.85rem" }}>
                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "0.5rem" }}>
                                    <div title={b.name}>{b.name}</div>
                                    <small style={{ color: "var(--text-secondary)" }}>{formatSize(b.size)} • {new Date(b.modifiedAt).toLocaleString()}</small>
                                </div>
                                <div style={{ display: "flex", gap: "0.25rem" }}>
                                    <button class="btn-start" onClick={() => handleDownload(b.name)} title="Download" style={{ padding: "0.25rem 0.5rem" }}>
                                        <i class="fas fa-download"></i>
                                    </button>
                                    <button class="btn-stop" onClick={() => handleRestore(b.name)} title="Restore" style={{ padding: "0.25rem 0.5rem" }}>
                                        <i class="fas fa-trash-arrow-up"></i>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default BackupManager;

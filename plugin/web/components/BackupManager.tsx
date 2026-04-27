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
                <span class="material-symbols-rounded">folder_zip</span>
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
                        <span class="material-symbols-rounded">add</span>
                        Create
                    </button>
                    <button 
                        class="btn-restart" 
                        style={{ flex: 1 }}
                        onClick={fetchBackups}
                        disabled={loading}
                    >
                        <span class={`material-symbols-rounded ${loading ? 'fa-spin' : ''}`}>sync</span>
                        Refresh
                    </button>
                </div>

                <div class="upload-area" style={{ marginBottom: "0.5rem" }}>
                    <label class="btn-start" style={{ display: "block", textAlign: "center", cursor: "pointer", opacity: uploading ? 0.5 : 1 }}>
                        <span class={`material-symbols-rounded ${uploading ? 'fa-spin' : ''}`}>{uploading ? 'sync' : 'upload'}</span>
                        {uploading ? ' Uploading...' : ' Upload Backup (.tar.gz)'}
                        <input type="file" accept=".tar.gz" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
                    </label>
                </div>

                <div class="backup-list">
                    {backups.length === 0 ? (
                        <p class="hint-text" style={{ textAlign: "center", padding: "1rem" }}>No backups found</p>
                    ) : (
                        backups.map(b => (
                            <div key={b.name} class="backup-item">
                                <div class="backup-info">
                                    <div class="backup-name" title={b.name}>{b.name}</div>
                                    <small class="backup-meta">{formatSize(b.size)} • {new Date(b.modifiedAt).toLocaleString()}</small>
                                </div>
                                <div class="backup-actions">
                                    <button class="btn-start" onClick={() => handleDownload(b.name)} title="Download">
                                        <span class="material-symbols-rounded">download</span>
                                    </button>
                                    <button class="btn-stop" onClick={() => handleRestore(b.name)} title="Restore">
                                        <span class="material-symbols-rounded">restore</span>
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

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePQC } from '../../context/PQCContext';
import { Loader2, Plus, PenTool, Upload, FileText, Check, Shield } from 'lucide-react';

const CreateSecret = ({ onCreate, onCancel }) => {
    const { authType } = useAuth();
    const { hasLocalVault, isExtensionAvailable } = usePQC();

    // Form State
    const [name, setName] = useState('');
    const [contentType, setContentType] = useState('text'); // 'text' | 'file'
    const [content, setContent] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isSigned, setIsSigned] = useState(false);
    const [creating, setCreating] = useState(false);

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    const handleSubmit = async (e) => {
        e.preventDefault();
        setCreating(true);

        try {
            // Validation
            if (!name) {
                alert("Please enter a name.");
                setCreating(false);
                return;
            }
            if (contentType === 'text' && !content) {
                alert("Please enter content.");
                setCreating(false);
                return;
            }
            if (contentType === 'file' && !selectedFile) {
                alert("Please select a file.");
                setCreating(false);
                return;
            }

            let rawContent = content;
            if (contentType === 'file') {
                if (selectedFile.size > MAX_FILE_SIZE) {
                    alert("File too large (Max 5MB).");
                    setCreating(false);
                    return;
                }
                const base64 = await readFileAsBase64(selectedFile);
                rawContent = JSON.stringify({
                    type: 'file',
                    name: selectedFile.name,
                    mime: selectedFile.type,
                    content: base64
                });
            }

            await onCreate(name, isSigned ? 'signed_document' : (contentType === 'file' ? 'file' : 'standard'), rawContent, isSigned);
            // Reset happens in parent or here? 
            // Parent closes form usually.
            onCancel();
        } catch (error) {
            console.error(error);
            alert("Creation failed: " + error.message);
        } finally {
            setCreating(false);
        }
    };

    const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-6 shadow-lg animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Plus className="w-5 h-5 text-indigo-500" /> Create New Secret
                </h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g. My WiFi Password"
                        disabled={creating}
                    />
                </div>

                {/* Type Selection */}
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full sm:w-fit">
                    <button
                        type="button"
                        onClick={() => setContentType('text')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${contentType === 'text' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        <div className="flex items-center gap-2 justify-center">
                            <PenTool className="w-4 h-4" /> Text
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setContentType('file')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${contentType === 'file' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        <div className="flex items-center gap-2 justify-center">
                            <Upload className="w-4 h-4" /> File
                        </div>
                    </button>
                </div>

                {contentType === 'text' ? (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Content</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            rows={4}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                            placeholder="Enter the secret content here..."
                            disabled={creating}
                        />
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select File</label>
                        <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center bg-slate-50 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                            {selectedFile ? (
                                <div className="flex items-center justify-center gap-3">
                                    <FileText className="w-8 h-8 text-indigo-500" />
                                    <div className="text-left">
                                        <div className="font-medium text-slate-900 dark:text-white">{selectedFile.name}</div>
                                        <div className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFile(null)}
                                        className="ml-4 text-xs text-red-500 hover:text-red-600 underline"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                    <div className="text-sm text-slate-500">
                                        <label className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                                            <span>Upload a file</span>
                                            <input type="file" className="sr-only" onChange={e => setSelectedFile(e.target.files[0])} disabled={creating} />
                                        </label>
                                        <p className="pl-1">or drag and drop</p>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">Up to 5MB</p>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {authType === 'trustkeys' && (
                    <div className="flex items-center gap-2 py-2">
                        <button
                            type="button"
                            onClick={() => setIsSigned(!isSigned)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${isSigned
                                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                                    : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            <Shield className={`w-4 h-4 ${isSigned ? 'fill-current' : ''}`} />
                            {isSigned ? 'Digitally Sign Document' : 'Add Digital Signature'}
                            {isSigned && <Check className="w-3 h-3 ml-1" />}
                        </button>
                        <span className="text-xs text-slate-400">
                            (Requires PQC Identity)
                        </span>
                    </div>
                )}

                <div className="flex gap-3 justify-end mt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={creating}
                        className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={creating}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:scale-95 transition-all flex items-center gap-2"
                    >
                        {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Secret'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateSecret;

import React, { useState, useCallback, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { ImageFile, AspectRatio, ProcessingStatus } from './types';
import { createCompositeImage } from './utils/imageUtils';
import { processImageWithGemini } from './services/geminiService';
import { UploadIcon } from './components/icons';
import ImageCard from './components/ImageCard';

// Using declare to inform TypeScript that JSZip is available globally from the CDN
declare const JSZip: any;

// Set to 1 to process images sequentially and avoid rate-limiting errors (429).
const CONCURRENT_LIMIT = 1;

const App: React.FC = () => {
    const [files, setFiles] = useState<ImageFile[]>([]);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('Original');
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [progress, setProgress] = useState({ processed: 0, total: 0 });
    const [error, setError] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (selectedFiles: FileList) => {
        setError('');
        setFiles([]);
        setProgress({ processed: 0, total: 0 });
        const imageFiles = Array.from(selectedFiles).filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        const filePromises = imageFiles.map(file => {
            return new Promise<ImageFile>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                    if (typeof e.target?.result === 'string') {
                        resolve({
                            id: `${file.name}-${file.lastModified}`,
                            file,
                            name: file.name,
                            originalBase64: e.target.result,
                            status: 'waiting',
                        });
                    } else {
                        reject(new Error('Failed to read file'));
                    }
                };
                reader.onerror = () => reject(new Error('File reading error'));
                reader.readAsDataURL(file);
            });
        });

        const newFiles = await Promise.all(filePromises);
        setFiles(newFiles);
    }, []);
    
    const onDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
            handleFiles(e.dataTransfer.files);
        }
    };

    const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            handleFiles(e.target.files);
        }
    };
    
    const updateFileStatus = (id: string, status: ProcessingStatus, extra: { error?: string; processedBase64?: string }) => {
        setFiles(prevFiles => prevFiles.map(f => f.id === id ? { ...f, status, ...extra } : f));
    };

    const handleProcessImages = async () => {
        if (files.length === 0) {
            setError('Por favor, selecione as imagens primeiro.');
            return;
        }
        setError('');
        setIsProcessing(true);
        setProgress({ processed: 0, total: files.length });

        const queue = [...files.filter(f => f.status === 'waiting')];

        const processImage = async (image: ImageFile) => {
            try {
                let imageToSendToGemini: string;
                let mimeType: 'image/png' | 'image/jpeg' = 'image/png';
                const isOriginalRatio = aspectRatio === 'Original';

                if (isOriginalRatio) {
                    // When only cleaning, convert to JPEG as it can be more robust for the API.
                    updateFileStatus(image.id, 'compositing', {});
                    imageToSendToGemini = await new Promise<string>((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return reject(new Error("Failed to get canvas context for JPEG conversion."));
                            canvas.width = img.width;
                            canvas.height = img.height;
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL('image/jpeg', 0.92));
                        };
                        img.onerror = () => reject(new Error("Failed to load image for JPEG conversion"));
                        img.src = image.originalBase64;
                    });
                    mimeType = 'image/jpeg';
                } else {
                    // For resizing, create a composite image on a transparent background (PNG).
                    updateFileStatus(image.id, 'compositing', {});
                    imageToSendToGemini = await createCompositeImage(image.originalBase64, aspectRatio);
                    mimeType = 'image/png';
                }
                
                updateFileStatus(image.id, 'processing', {});
                const finalImage = await processImageWithGemini(imageToSendToGemini, isOriginalRatio, mimeType);

                updateFileStatus(image.id, 'done', { processedBase64: finalImage });
            } catch (err: any) {
                updateFileStatus(image.id, 'error', { error: err.message || 'Unknown error' });
                // If a rate limit error occurs, we throw it to stop all workers.
                if (err.message.includes('429')) {
                    throw err; 
                }
            } finally {
                setProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
            }
        };
        
        try {
            const workers = Array(CONCURRENT_LIMIT).fill(null).map(async () => {
                while (queue.length > 0) {
                    const image = queue.shift();
                    if (image) {
                        await processImage(image);
                    }
                }
            });

            await Promise.all(workers);

        } catch (err: any) {
            // Catch the rate-limit error propagated from a worker and display it globally.
             if (err.message.includes('429')) {
                setError(err.message);
            }
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleDownloadAll = () => {
        const zip = new JSZip();
        const processedImages = files.filter(f => f.status === 'done' && f.processedBase64);

        processedImages.forEach(img => {
            const base64Data = img.processedBase64!.split(',')[1];
            zip.file(`processed_${img.name}`, base64Data, { base64: true });
        });

        zip.generateAsync({ type: "blob" })
            .then((content: Blob) => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = "processed_images.zip";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
    };

    const processedCount = files.filter(f => f.status === 'done').length;
    
    const aspectRatioOptions: { value: AspectRatio, label: string }[] = [
        { value: 'Original', label: 'Original' },
        { value: '16:9', label: '16:9 (Horizontal)' },
        { value: '9:16', label: '9:16 (Vertical)' },
    ];

    return (
        <div className="max-w-7xl mx-auto">
            <header className="text-center mb-8">
                <h1 className="text-4xl font-bold text-white">Batch Image Reframer & Cleaner</h1>
                <p className="text-lg text-gray-400 mt-2">Envie múltiplas imagens para redimensionar e limpar automaticamente.</p>
            </header>

            <main>
                <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-8 space-y-8">
                    {/* Step 1 */}
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Passo 1: Escolha a proporção desejada</h3>
                        <div className="flex gap-4">
                            {aspectRatioOptions.map(({ value, label }) => (
                                <label key={value} className="flex-1">
                                    <input
                                        type="radio"
                                        name="aspect-ratio"
                                        value={value}
                                        checked={aspectRatio === value}
                                        onChange={() => setAspectRatio(value)}
                                        className="sr-only peer"
                                        disabled={isProcessing}
                                    />
                                    <div className="p-4 bg-gray-700 text-center rounded-lg cursor-pointer border-2 border-gray-700 peer-checked:border-blue-500 peer-checked:bg-blue-600 transition">
                                        {label}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Passo 2: Envie as suas imagens</h3>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            className={`p-10 text-center cursor-pointer border-2 dashed rounded-lg transition-all duration-300 ${isDragging ? 'border-blue-500 bg-gray-700' : 'border-gray-600'}`}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                multiple
                                accept="image/jpeg, image/png, image/webp"
                                className="hidden"
                                onChange={onFileChange}
                                disabled={isProcessing}
                            />
                            <div className="flex flex-col items-center">
                                <UploadIcon className="w-12 h-12 text-gray-500 mb-4" />
                                <p className="text-gray-400">Arraste e solte as imagens aqui, ou <span className="font-semibold text-blue-400">clique para selecionar</span></p>
                                <p className="text-xs text-gray-500 mt-1">Suporta JPG, PNG, WEBP</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Step 3 */}
                    <div className="text-center border-t border-gray-700 pt-6">
                         <button 
                            onClick={handleProcessImages}
                            disabled={isProcessing || files.length === 0}
                            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                            {isProcessing ? `Processando... ${progress.processed}/${progress.total}` : `Processar ${files.length} Imagens`}
                        </button>
                        {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}
                    </div>
                </div>
                
                {(isProcessing || progress.processed > 0) && (
                    <div className="mb-8">
                        <p className="text-center text-lg text-gray-300">Progresso: {progress.processed} de {progress.total}</p>
                        <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                    </div>
                )}
                
                {processedCount > 0 && !isProcessing && (
                     <div className="text-center mb-8">
                         <button 
                            onClick={handleDownloadAll}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition">
                            Baixar Todas as {processedCount} Imagens (.zip)
                        </button>
                    </div>
                )}

                {files.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {files.map(file => (
                            <ImageCard key={file.id} image={file} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;
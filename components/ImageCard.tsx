import React from 'react';
import { ImageFile } from '../types';
import ComparisonSlider from './ComparisonSlider';

interface ImageCardProps {
    image: ImageFile;
}

const statusMessages: { [key in ImageFile['status']]: string } = {
    waiting: 'Aguardando na fila...',
    compositing: 'Preparando imagem...',
    processing: 'Processando com IA...',
    done: 'Concluído!',
    error: 'Erro',
};

const Loader: React.FC = () => (
    <div className="border-4 border-gray-600 border-t-blue-500 rounded-full w-10 h-10 animate-spin"></div>
);

const ImageCard: React.FC<ImageCardProps> = ({ image }) => {
    const { name, status, error, originalBase64, processedBase64 } = image;

    return (
        <div className="bg-gray-800 rounded-xl shadow-lg overflow-hidden flex flex-col">
            <div className="relative w-full aspect-[16/9] bg-gray-700 flex-shrink-0">
                {status !== 'done' && status !== 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                        <Loader />
                        <p className="text-sm text-gray-400 mt-2">{statusMessages[status]}</p>
                    </div>
                )}
                {status === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <p className="text-red-500 font-semibold">Falha no Processamento</p>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-3">{error}</p>
                    </div>
                )}
                {status === 'done' && processedBase64 && (
                    <ComparisonSlider beforeSrc={originalBase64} afterSrc={processedBase64} />
                )}
            </div>
            <div className="p-4 bg-gray-800">
                <p className="text-sm text-gray-300 truncate font-medium" title={name}>{name}</p>
                {status === 'done' && processedBase64 && (
                    <a
                        href={processedBase64}
                        download={`processed_${name}`}
                        className="mt-3 inline-block w-full bg-blue-600 text-white text-center py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
                    >
                        Download
                    </a>
                )}
            </div>
        </div>
    );
};

export default ImageCard;
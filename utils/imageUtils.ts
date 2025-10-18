export async function createCompositeImage(base64Image: string, aspectRatio: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Explicitly request an alpha channel to ensure transparency is supported.
            const ctx = canvas.getContext('2d', { alpha: true });
            if (!ctx) return reject(new Error("Failed to get canvas context"));

            const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
            
            let targetWidth, targetHeight;
            const longEdge = 1024;
            if (ratioW > ratioH) {
                targetWidth = longEdge;
                targetHeight = Math.round(longEdge * (ratioH / ratioW));
            } else {
                targetHeight = longEdge;
                targetWidth = Math.round(longEdge * (ratioW / ratioH));
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            // Explicitly clear the canvas to ensure the background is transparent, preventing black bars.
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const imgAspectRatio = img.width / img.height;
            const canvasAspectRatio = canvas.width / canvas.height;
            let drawWidth, drawHeight, x, y;

            if (imgAspectRatio > canvasAspectRatio) {
                drawWidth = canvas.width;
                drawHeight = Math.round(drawWidth / imgAspectRatio);
                x = 0;
                y = Math.round((canvas.height - drawHeight) / 2);
            } else {
                drawHeight = canvas.height;
                drawWidth = Math.round(drawHeight * imgAspectRatio);
                x = Math.round((canvas.width - drawWidth) / 2);
                y = 0;
            }
            
            ctx.drawImage(img, x, y, drawWidth, drawHeight);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => {
            reject(new Error("Failed to load image for canvas composition."));
        }
        img.src = base64Image;
    });
}
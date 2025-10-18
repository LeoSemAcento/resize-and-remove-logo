import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

const PROMPT_EXPAND = `
**TASK: Image Correction and Expansion**
1.  **SUBJECT:** Do NOT alter the main subject.
2.  **FILL:** Fill all transparent areas with a photorealistic, seamless continuation of the background.
3.  **CLEAN:** Completely remove any watermarks, logos, or text artifacts.
**RULES:**
- NO black bars or borders in the final image.
- DO NOT add any new watermarks or icons (especially sparkle icons).
`;

const PROMPT_CLEAN_ONLY = `
**TASK: Image Correction**
1.  **SUBJECT:** Do NOT alter the main subject. Maintain the original aspect ratio and composition.
2.  **CLEAN:** Completely and seamlessly remove any watermarks, logos, text artifacts, and any black bars (letterboxing/pillarboxing).
**RULES:**
- DO NOT add any new watermarks or icons.
- DO NOT crop, expand, or change the aspect ratio.
`;


export async function processImageWithGemini(
    base64ImageData: string,
    isOriginalRatio: boolean,
    mimeType: 'image/png' | 'image/jpeg'
): Promise<string> {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = isOriginalRatio ? PROMPT_CLEAN_ONLY : PROMPT_EXPAND;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        {
                            inlineData: {
                                mimeType,
                                data: base64ImageData.split(',')[1],
                            },
                        },
                        { text: prompt },
                    ],
                },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });

            const candidate = response.candidates?.[0];
            if (!candidate) {
                const blockReason = response.promptFeedback?.blockReason;
                if(blockReason) {
                     throw new Error(`API Error: Prompt blocked. Reason: ${blockReason}`);
                }
                throw new Error("API Error: Invalid or empty response received.");
            }

            const base64Data = candidate.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (base64Data) {
                return `data:image/png;base64,${base64Data}`;
            } else {
                const finishReason = candidate.finishReason || 'Unknown';
                if (finishReason === 'SAFETY') {
                    const safetyRatings = candidate.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || 'N/A';
                    throw new Error(`Image blocked by safety policies. Details: ${safetyRatings}`);
                }
                throw new Error(`API did not return an image. Reason: ${finishReason}`);
            }
        } catch (error: any) {
            lastError = error;
            const errorMessage = error.message || '';
            console.error(`Attempt ${attempt} failed: ${errorMessage}`);
            
            // If it's a rate limit error, stop retrying immediately.
            if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
                throw new Error('Você excedeu sua cota de API (Erro 429). O processamento foi interrompido. Por favor, aguarde um pouco ou verifique seu plano e detalhes de faturamento.');
            }

            if (attempt < maxRetries) {
                // Increased base delay for other retries
                await new Promise(res => setTimeout(res, 1500 * Math.pow(2, attempt - 1)));
            }
        }
    }

    if (lastError) {
        if (lastError.message.includes('OTHER')) {
             throw new Error('A API falhou ao processar a imagem, mesmo após várias tentativas. Isso pode ser devido a um formato não suportado, arquivo corrompido ou problemas de conteúdo.');
        }
        throw lastError;
    }
    
    throw new Error('Image processing failed after multiple retries.');
}
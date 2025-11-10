/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";

/**
 * Helper to get the API client.
 * The API key is retrieved from session storage.
 */
const getGeminiClient = (): GoogleGenAI => {
    const apiKey = sessionStorage.getItem('gemini-api-key');
    if (!apiKey) {
        throw new Error('API key not found. Please set your API key.');
    }
    return new GoogleGenAI({ apiKey });
};

// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

const handleApiResponse = (
    response: GenerateContentResponse,
    context: string // e.g., "edit", "filter", "adjustment"
): string => {
    // 1. Check for prompt blocking first
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `Request was blocked. Reason: ${blockReason}. ${blockReasonMessage || ''}`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }

    // 2. Try to find the image part
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Received image data (${mimeType}) for ${context}`);
        return `data:${mimeType};base64,${data}`;
    }

    // 3. If no image, check for other reasons
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `Image generation for ${context} stopped unexpectedly. Reason: ${finishReason}. This often relates to safety settings.`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }
    
    const textFeedback = response.text?.trim();
    const errorMessage = `The AI model did not return an image for the ${context}. ` + 
        (textFeedback 
            ? `The model responded with text: "${textFeedback}"`
            : "This can happen due to safety filters or if the request is too complex. Please try rephrasing your prompt to be more direct.");

    console.error(`Model response did not contain an image part for ${context}.`, { response });
    throw new Error(errorMessage);
};

/**
 * Generates an edited image using generative AI based on a text prompt and a specific point.
 * @param originalImage The original image file.
 * @param userPrompt The text prompt describing the desired edit.
 * @param hotspot The {x, y} coordinates on the image to focus the edit.
 * @param mode The type of edit to perform.
 * @returns A promise that resolves to the data URL of the edited image.
 */
export const generateEditedImage = async (
    originalImage: File,
    userPrompt: string,
    hotspot: { x: number, y: number },
    mode: 'modify' | 'add' | 'remove' = 'modify'
): Promise<string> => {
    console.log(`Starting generative ${mode} at:`, hotspot);
    const ai = getGeminiClient();
    
    const originalImagePart = await fileToPart(originalImage);

    let instruction: string;
    switch (mode) {
        case 'add':
            instruction = "add the object described by the user to the image at the specified location. The added object must be realistic and blend seamlessly with the lighting, shadows, and style of the original image.";
            break;
        case 'remove':
            instruction = "remove the object at the specified location. Fill in the background naturally and realistically, matching the surrounding texture, lighting, and patterns.";
            break;
        case 'modify':
        default:
            instruction = "perform a natural, localized edit on the provided image based on the user's request.";
            break;
    }

    const prompt = `IMPORTANT: The output image MUST be exactly 1600x1600 pixels.

You are an expert photo editor AI. Your task is to ${instruction}
User Request: "${userPrompt}"
Edit Location: Focus on the area around pixel coordinates (x: ${hotspot.x}, y: ${hotspot.y}).

Editing Guidelines:
- The edit must be realistic and blend seamlessly with the surrounding area.
- The rest of the image (outside the immediate edit area) must remain identical to the original.
- The final image must NOT contain any text, numbers, logos, or watermarks.

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final edited image. The image resolution MUST be exactly 1600x1600 pixels. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    console.log('Received response from model.', response);

    return handleApiResponse(response, mode);
};

/**
 * Replaces the background of an image using generative AI.
 * @param originalImage The original image file.
 * @param backgroundPrompt The text prompt describing the new background.
 * @returns A promise that resolves to the data URL of the edited image.
 */
export const generateReplacedBackgroundImage = async (
    originalImage: File,
    backgroundPrompt: string,
): Promise<string> => {
    console.log(`Starting background replacement: ${backgroundPrompt}`);
    const ai = getGeminiClient();
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `IMPORTANT: The output image MUST be exactly 1600x1600 pixels.

You are an expert photo editor AI. Your task is to replace the background of the provided image.
- Identify the main subject(s) in the foreground with high precision.
- Keep the foreground subject(s) completely unchanged, preserving all details, hair, and edges.
- Replace the existing background entirely with a new one based on the user's description.
- The new background must be photorealistic and blend seamlessly with the lighting, shadows, and perspective of the foreground subject.
- Composition Guideline: After replacing the background, ensure the main subject is well-framed. It should be centered and fill a significant portion of the image area, creating a professional, product-focused look.
- The final image must NOT contain any text, numbers, logos, or watermarks.

User's new background description: "${backgroundPrompt}"

Output: Return ONLY the final edited image with the new background. The image resolution MUST be exactly 1600x1600 pixels. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and background prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    console.log('Received response from model for background replacement.', response);
    
    return handleApiResponse(response, 'background replacement');
};


/**
 * Generates an image with a filter applied using generative AI.
 * @param originalImage The original image file.
 * @param filterPrompt The text prompt describing the desired filter.
 * @returns A promise that resolves to the data URL of the filtered image.
 */
export const generateFilteredImage = async (
    originalImage: File,
    filterPrompt: string,
): Promise<string> => {
    console.log(`Starting filter generation: ${filterPrompt}`);
    const ai = getGeminiClient();
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `IMPORTANT: The output image MUST be exactly 1600x1600 pixels.

You are an expert photo editor AI. Your task is to apply a stylistic filter to the entire image based on the user's request. Do not change the composition or content, only apply the style.
Filter Request: "${filterPrompt}"

General Guidelines:
- The final image must NOT contain any text, numbers, logos, or watermarks.

Safety & Ethics Policy:
- Filters may subtly shift colors, but you MUST ensure they do not alter a person's fundamental race or ethnicity.
- You MUST REFUSE any request that explicitly asks to change a person's race (e.g., 'apply a filter to make me look Chinese').

Output: Return ONLY the final filtered image. The image resolution MUST be exactly 1600x1600 pixels. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and filter prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    console.log('Received response from model for filter.', response);
    
    return handleApiResponse(response, 'filter');
};

/**
 * Generates an image with a global adjustment applied using generative AI.
 * @param originalImage The original image file.
 * @param adjustmentPrompt The text prompt describing the desired adjustment.
 * @returns A promise that resolves to the data URL of the adjusted image.
 */
export const generateAdjustedImage = async (
    originalImage: File,
    adjustmentPrompt: string,
): Promise<string> => {
    console.log(`Starting global adjustment generation: ${adjustmentPrompt}`);
    const ai = getGeminiClient();
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `IMPORTANT: The output image MUST be exactly 1600x1600 pixels.

You are an expert photo editor AI. Your task is to perform a natural, global adjustment to the entire image based on the user's request.
User Request: "${adjustmentPrompt}"

Editing Guidelines:
- The adjustment must be applied across the entire image.
- The result must be photorealistic.
- The final image must NOT contain any text, numbers, logos, or watermarks.

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final adjusted image. The image resolution MUST be exactly 1600x1600 pixels. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and adjustment prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    console.log('Received response from model for adjustment.', response);
    
    return handleApiResponse(response, 'adjustment');
};
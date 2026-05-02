import { useState } from 'react';
import { GoogleGenAI } from '@google/genai';

// Requires GEMINI_API_KEY to be available in env
const apiKey = process.env.GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

export type ProcessingMode = 'translate' | 'summarize' | 'extract_table' | 'translate_table';

export function useGemini() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processImage = async (base64Image: string, mode: ProcessingMode) => {
    setLoading(true);
    setResult(null);
    setError(null);
    
    try {
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is missing.");
      }

      // Convert data URL to base64 string without the prefix
      const base64Data = base64Image.split(',')[1];
      
      let promptText = "";
      if (mode === 'translate') {
          promptText = "Extract the text from this image and translate it to Vietnamese. Maintain the original formatting structure, including EXACTLY the same line breaks and paragraphs as the original text. Only return the translated Vietnamese text, without any introductory or conversational text, and do not include the original text. If there is no text, describe what you see in Vietnamese.";
      } else if (mode === 'extract_table') {
          promptText = "Extract the table from this image exactly as it appears. CRITICAL: Preserve the exact row and column order. Ensure every row has the EXACT same number of columns. If a cell spans multiple columns, emit empty CSV fields for the extra spanned columns. Output the result in standard CSV format, suitable for copying into Excel. Only return the raw CSV text without markdown formatting. IMPORTANT: For vertically merged cells, write the text ONLY in the first row. Leave the corresponding cell empty (do not repeat the text) for all subsequent rows in that merged block.";
      } else if (mode === 'translate_table') {
          promptText = "Extract the table from this image exactly as it appears, and translate all text within the table to Vietnamese. CRITICAL: Preserve the exact row and column order. Ensure every row has the EXACT same number of columns. If a cell spans multiple columns, emit empty CSV fields for the extra spanned columns. Output the result in standard CSV format, suitable for copying into Excel. Only return the raw CSV text without markdown formatting. IMPORTANT: For vertically merged cells, write the translated text ONLY in the first row. Leave the corresponding cell empty (do not repeat the text) for all subsequent rows in that merged block.";
      } else {
          promptText = "Extract the content of this image and provide a concise summary in Vietnamese. Highlight the key points.";
      }

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data,
              },
            },
            {
              text: promptText,
            },
          ],
        }
      });

      let fullText = "";
      for await (const chunk of stream) {
          if (chunk.text) {
              fullText += chunk.text;
              setResult(fullText);
          }
      }
      
      if (!fullText) {
          setResult("No text generated.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while communicating with Gemini.');
    } finally {
      setLoading(false);
    }
  };

  return {
    processImage,
    loading,
    result,
    error,
    setResult
  };
}

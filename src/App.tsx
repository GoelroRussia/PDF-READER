import { useState } from 'react';
import PdfViewer from './components/PdfViewer';
import { useGemini, ProcessingMode } from './hooks/useGemini';
import { UploadCloud, FileText, Languages, Sparkles, X, Loader2, Table } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mode, setMode] = useState<ProcessingMode>('translate');
  
  const { processImage, loading, result, error, setResult } = useGemini();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setSelectedImage(null);
      setResult(null);
    } else if (file) {
      alert("Please upload a valid PDF file.");
    }
  };

  const handleRegionSelected = (base64: string) => {
    setSelectedImage(base64);
    // Auto trigger translation/summarization when selection is made
    processImage(base64, mode);
  };

  const handleModeChange = (newMode: ProcessingMode) => {
    setMode(newMode);
    if (selectedImage && !loading) {
        processImage(selectedImage, newMode);
    }
  };

  if (!pdfFile) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 transform -rotate-3 shadow-lg">
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Gemini PDF Reader</h1>
          <p className="text-gray-500 mb-8 leading-relaxed">
            Upload a PDF to view, select regions, and use AI to translate or summarize the content instantly.
          </p>
          
          <label className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-gray-200 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <UploadCloud className="w-10 h-10 text-gray-400 mb-3" />
              <p className="mb-2 text-sm text-gray-600 font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-500">PDF documents only</p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="application/pdf"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#F3F4F6] font-sans overflow-hidden">
      {/* Top Navigation */}
      <nav className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-lg">G</div>
          <span className="font-semibold text-gray-800 hidden sm:inline">Gemini PDF Reader</span>
          <div className="h-4 w-px bg-gray-300 mx-2 hidden sm:block"></div>
          <span className="text-sm text-gray-500 truncate max-w-[150px] sm:max-w-[300px]">{pdfFile.name}</span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex p-1 bg-gray-100 rounded-lg shrink-0 mr-4">
              <button
                 onClick={() => handleModeChange('translate')}
                 className={`flex items-center justify-center space-x-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${mode === 'translate' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <Languages className="w-3.5 h-3.5" />
                  <span>Translate</span>
              </button>
              <button
                 onClick={() => handleModeChange('summarize')}
                 className={`flex items-center justify-center space-x-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${mode === 'summarize' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Summarize</span>
              </button>
              <button
                 onClick={() => handleModeChange('extract_table')}
                 className={`flex items-center justify-center space-x-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${mode === 'extract_table' || mode === 'translate_table' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <Table className="w-3.5 h-3.5" />
                  <span>Table to Excel</span>
              </button>
          </div>
          <button 
            onClick={() => setPdfFile(null)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-md font-medium shadow-sm transition-colors"
          >
            Close PDF
          </button>
        </div>
      </nav>

      {/* Main Layout Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer Area */}
        <main className="flex-1 overflow-hidden relative">
          <PdfViewer 
              file={pdfFile} 
              onSelectRegion={handleRegionSelected}
              onTranslateTable={() => handleModeChange('translate_table')}
              aiResult={result}
              aiLoading={loading}
              aiError={error}
              aiMode={mode}
           />
        </main>
      </div>
    </div>
  );
}

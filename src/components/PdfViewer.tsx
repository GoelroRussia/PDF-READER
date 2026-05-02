import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { cn } from '../lib/utils';
import { Loader2, ZoomIn, ZoomOut, Download, Languages } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useInView } from 'react-intersection-observer';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  file: File;
  onSelectRegion?: (base64Image: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onTranslateTable?: () => void;
  className?: string;
  aiResult?: string | null;
  aiLoading?: boolean;
  aiError?: string | null;
  aiMode?: string;
}

interface PdfPageViewProps {
  pageNumber: number;
  pdf: pdfjsLib.PDFDocumentProxy;
  containerWidth: number;
  zoom: number;
  aspectRatio: number;
  isActiveSelection: boolean;
  onActivateSelection: (pageIndex: number) => void;
  onSelectRegion?: (base64Image: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onTranslateTable?: () => void;
  aiResult?: string | null;
  aiLoading?: boolean;
  aiError?: string | null;
  aiMode?: string;
}

function parseCSV(text: string): string[][] {
  const lines = text.trim().split('\n');
  let separator = ',';
  if (lines.length > 0 && lines[0].includes('|') && !lines[0].includes(',')) {
    separator = '|';
  }

  return lines.map(line => {
    if (separator === '|') {
      let l = line.trim();
      if (l.startsWith('|')) l = l.slice(1);
      if (l.endsWith('|')) l = l.slice(0, -1);
      return l.split('|').map(c => c.trim());
    }

    const row: string[] = [];
    let inQuotes = false;
    let currentVal = '';
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(currentVal.trim());
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    row.push(currentVal.trim());
    return row;
  }).filter(row => {
    // Filter out markdown separator rows like |---|---|
    return !(separator === '|' && row.every(cell => cell.match(/^[:-\s]+$/)));
  });
}

function PdfPageView({
  pageNumber,
  pdf,
  containerWidth,
  zoom,
  aspectRatio,
  isActiveSelection,
  onActivateSelection,
  onSelectRegion,
  onTranslateTable,
  aiResult,
  aiLoading,
  aiError,
  aiMode,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const { ref, inView } = useInView({ rootMargin: '2000px 0px', triggerOnce: false });
  const [isRendered, setIsRendered] = useState(false);
  const [renderedZoom, setRenderedZoom] = useState(0);

  // Selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [hasSelection, setHasSelection] = useState(false);
  const [selectionRect, setSelectionRect] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || !inView) return;
    if (isRendered && renderedZoom === zoom) return;
    
    try {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;
      
      const unscaledViewport = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(containerWidth - 64, 1200) * zoom;
      const scale = targetWidth / unscaledViewport.width;
      
      const viewport = page.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height =  Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : null;

      const renderContext = {
        canvasContext: context,
        canvas: canvas,
        transform: transform as any,
        viewport: viewport
      };

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;
      setIsRendered(true);
      setRenderedZoom(zoom);
      
    } catch (error: any) {
      if (error?.name === 'RenderingCancelledException') {
          return; // Suppress cancelled exception
      }
      console.error('Error rendering page:', error);
    }
  }, [pdf, pageNumber, containerWidth, zoom, inView]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  useEffect(() => {
    if (!isActiveSelection) {
      setHasSelection(false);
    }
  }, [isActiveSelection]);

  const extractAndNotifyForRect = (rectToExtract: {x: number, y: number, width: number, height: number}) => {
      if (!canvasRef.current || !onSelectRegion) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const sourceX = rectToExtract.x * scaleX;
      const sourceY = rectToExtract.y * scaleY;
      const sourceW = rectToExtract.width * scaleX;
      const sourceH = rectToExtract.height * scaleY;
      
      // Limit maximum dimension to 1600px for faster processing
      const maxDimension = 1600;
      let targetW = sourceW;
      let targetH = sourceH;
      if (targetW > maxDimension || targetH > maxDimension) {
          const ratio = Math.min(maxDimension / targetW, maxDimension / targetH);
          targetW *= ratio;
          targetH *= ratio;
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = targetW;
      tempCanvas.height = targetH;
      const ctx = tempCanvas.getContext('2d');
      
      if (ctx) {
          ctx.drawImage(
              canvas,
              sourceX, sourceY, sourceW, sourceH,
              0, 0, targetW, targetH
          );
          
          const base64 = tempCanvas.toDataURL('image/jpeg', 0.8);
          onSelectRegion(base64, rectToExtract);
      }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canvasRef.current || !isRendered) return;
      onActivateSelection(pageNumber);
      
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
          setIsSelecting(true);
          setHasSelection(false);
          setStartPos({ x, y });
          setCurrentPos({ x, y });
      }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSelecting || !canvasRef.current || !isActiveSelection) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

      setCurrentPos({ x, y });
  };

  const handleMouseUp = () => {
      if (!isSelecting || !canvasRef.current || !isActiveSelection) return;
      setIsSelecting(false);

      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);

      if (width > 10 && height > 10) {
          const rect = {
              x: Math.min(startPos.x, currentPos.x),
              y: Math.min(startPos.y, currentPos.y),
              width,
              height
          };
          setSelectionRect(rect);
          setHasSelection(true);
          extractAndNotifyForRect(rect);
      }
  };

  const renderSelectionBox = () => {
      let x = 0, y = 0, w = 0, h = 0;
      
      if (isSelecting && isActiveSelection) {
          x = Math.min(startPos.x, currentPos.x);
          y = Math.min(startPos.y, currentPos.y);
          w = Math.abs(currentPos.x - startPos.x);
          h = Math.abs(currentPos.y - startPos.y);
      } else if (hasSelection && isActiveSelection) {
          x = selectionRect.x;
          y = selectionRect.y;
          w = selectionRect.width;
          h = selectionRect.height;
      } else {
          return null;
      }

      return (
          <>
            <div 
              className="absolute bg-blue-500/20 rounded shadow-sm border border-blue-400 cursor-crosshair"
              style={{ left: x, top: y, width: w, height: h, pointerEvents: 'none' }}
            />
            {hasSelection && !isSelecting && (aiLoading || aiResult || aiError) && isActiveSelection && (
                <div className="absolute z-30" style={{ left: x + w + 50, top: Math.max(0, y - 10), width: (aiMode === 'extract_table' || aiMode === 'translate_table') ? 'max-content' : '320px', maxWidth: '800px', minWidth: '320px' }}>
                    <svg className="absolute text-red-500 overflow-visible" style={{ left: '-50px', top: '20px', width: '50px', height: '40px' }} viewBox="0 0 50 40" fill="none">
                        <path d="M0 20 H46 M38 12 L46 20 L38 28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>

                    <div className="bg-white border-2 border-red-500 shadow-xl rounded p-4 min-h-[80px]" onMouseDown={(e) => e.stopPropagation()}>
                       {aiError && (
                           <div className="text-red-500 text-sm whitespace-pre-wrap font-medium">
                               {aiError}
                           </div>
                       )}
                       {aiLoading && !aiResult && !aiError && (
                           <div className="flex items-center space-x-2 text-gray-500 mb-2">
                               <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                               <span className="text-sm font-medium">Processing...</span>
                           </div>
                       )}
                       {aiResult && (
                           <div className="prose prose-sm max-w-none text-gray-800 prose-p:leading-relaxed text-sm whitespace-pre-wrap relative">
                               {aiMode === 'extract_table' || aiMode === 'translate_table' ? (
                                    <>
                                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
                                            <span className="font-medium text-xs text-gray-500 uppercase tracking-wider">
                                                {aiMode === 'translate_table' ? 'Translated CSV Output' : 'CSV Output'}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {aiMode === 'extract_table' && onTranslateTable && (
                                                    <button 
                                                        onClick={() => onTranslateTable()}
                                                        className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1 rounded-md transition-colors font-medium border border-red-200"
                                                    >
                                                        <Languages className="w-3.5 h-3.5" />
                                                        Translate
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => {
                                                        const blob = new Blob(['\uFEFF' + aiResult], { type: 'text/csv;charset=utf-8;' });
                                                        const url = window.URL.createObjectURL(blob);
                                                        const a = document.createElement('a');
                                                        a.setAttribute('hidden', '');
                                                        a.setAttribute('href', url);
                                                        a.setAttribute('download', 'extracted_table.csv');
                                                        document.body.appendChild(a);
                                                        a.click();
                                                        document.body.removeChild(a);
                                                    }}
                                                    className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors font-medium border border-blue-200"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                    Download CSV
                                                </button>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto max-w-full custom-scrollbar max-h-96 border border-gray-300 rounded mb-1">
                                            <table className="w-full text-[11px] text-left text-gray-800 border-collapse">
                                                <tbody className="divide-y divide-gray-300">
                                                    {parseCSV(aiResult).map((row, i) => (
                                                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                            {row.map((cell, j) => (
                                                                <td key={j} className={`px-2 py-1.5 border-r border-gray-300 last:border-r-0 max-w-[200px] whitespace-normal font-medium ${i === 0 ? 'bg-gray-100/80 font-semibold' : ''}`} title={cell}>
                                                                    {cell}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                               ) : (
                                   <ReactMarkdown>{aiResult}</ReactMarkdown>
                               )}
                               {aiLoading && <span className="inline-block w-2 h-4 ml-1 bg-gray-400 animate-pulse"></span>}
                           </div>
                       )}
                    </div>
                </div>
            )}
          </>
      );
  };

  const targetWidth = Math.min(containerWidth - 64, 1200) * zoom;
  const calculatedMinHeight = targetWidth * aspectRatio;

  return (
    <div 
      ref={ref}
      style={{ width: targetWidth > 0 ? targetWidth : '100%', minHeight: calculatedMinHeight > 0 ? calculatedMinHeight : 800 * zoom }}
      className="relative shadow-md bg-white select-none shrink-0 mx-auto transition-opacity duration-300"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {!isRendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400">
           <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />
      {renderSelectionBox()}
    </div>
  );
}

export default function PdfViewer({ file, onSelectRegion, onTranslateTable, className, aiResult, aiLoading, aiError, aiMode }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(1.414); // A4 default aspect ratio
  
  const [containerWidth, setContainerWidth] = useState(800);
  const [activeSelectionPage, setActiveSelectionPage] = useState<number | null>(null);
  const [zoom, setZoom] = useState(2);
  const [zoomInput, setZoomInput] = useState("200");

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 5));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
  
  useEffect(() => {
     setZoomInput(Math.round(zoom * 100).toString());
  }, [zoom]);

  const handleZoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setZoomInput(e.target.value);
  };

  const handleZoomSubmit = (e: React.KeyboardEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) => {
      if ('key' in e && e.key !== 'Enter') return;
      let val = parseInt(zoomInput, 10);
      if (isNaN(val)) val = Math.round(zoom * 100);
      val = Math.max(50, Math.min(val, 500));
      setZoom(val / 100);
      setZoomInput(val.toString());
  };

  useEffect(() => {
    let active = true;
    
    const loadPdf = async () => {
      setLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (active) {
          setPdf(pdfDoc);
          setNumPages(pdfDoc.numPages);
          
          const page1 = await pdfDoc.getPage(1);
          const viewport = page1.getViewport({ scale: 1 });
          setAspectRatio(viewport.height / viewport.width);
          
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading PDF:', error);
        if (active) setLoading(false);
      }
    };
    loadPdf();
    return () => {
      active = false;
    };
  }, [file]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
        setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (loading) {
      return (
          <div className={cn("flex flex-col items-center justify-center p-12 text-gray-500", className)}>
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Loading PDF...</p>
          </div>
      );
  }

  return (
    <div className={cn("flex h-full w-full bg-gray-200 relative overflow-hidden", className)}>
        {/* Left Sidebar Tools */}
        <aside className="w-14 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-6 shrink-0 z-10 shadow-sm">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg cursor-pointer" title="Select Region">
              <div className="w-5 h-5 border-2 border-dashed border-current rounded-sm"></div>
          </div>
        </aside>

        {/* Main Scrolling Container */}
        <div ref={containerRef} className="flex-1 overflow-auto custom-scrollbar relative px-8 py-8 bg-gray-200">
            <div className="flex flex-col items-center gap-8 pb-32 min-w-max">
                {pdf && Array.from({ length: numPages }).map((_, i) => (
                    <PdfPageView 
                       key={i + 1}
                       pageNumber={i + 1}
                       pdf={pdf}
                       containerWidth={containerWidth}
                       zoom={zoom}
                       aspectRatio={aspectRatio}
                       isActiveSelection={activeSelectionPage === i + 1}
                       onActivateSelection={setActiveSelectionPage}
                       onSelectRegion={onSelectRegion}
                       onTranslateTable={onTranslateTable}
                       aiResult={aiResult}
                       aiLoading={aiLoading}
                       aiError={aiError}
                       aiMode={aiMode}
                    />
                ))}
            </div>
        </div>

        {/* Floating Zoom Controls */}
        <div className="absolute bottom-6 right-6 z-50 flex items-center gap-1 bg-white/90 backdrop-blur border border-gray-200 shadow-lg rounded-full px-3 py-2">
            <button onClick={handleZoomOut} className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors" title="Zoom Out">
                <ZoomOut className="w-5 h-5" />
            </button>
            <div className="flex items-center">
                <input 
                    type="text" 
                    value={zoomInput}
                    onChange={handleZoomInputChange}
                    onKeyDown={handleZoomSubmit}
                    onBlur={handleZoomSubmit}
                    className="w-10 text-center text-sm font-medium text-gray-600 bg-transparent border-none focus:ring-0 p-0 outline-none hover:bg-gray-100 rounded"
                    title="Zoom % (Enter to apply)"
                />
                <span className="text-sm font-medium text-gray-600">%</span>
            </div>
            <button onClick={handleZoomIn} className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors" title="Zoom In">
                <ZoomIn className="w-5 h-5" />
            </button>
        </div>
    </div>
  );
}


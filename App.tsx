/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
// FIX: Import `generateFilteredImage` and `generateAdjustedImage` which were missing.
import { generateEditedImage, generateReplacedBackgroundImage, generateFilteredImage, generateAdjustedImage } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import TextPanel from './components/TextPanel';
import { UndoIcon, RedoIcon, EyeIcon } from './components/icons';
import StartScreen from './components/StartScreen';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

type Tab = 'retouch' | 'text' | 'adjust' | 'filters' | 'crop';
type EditMode = 'modify' | 'remove' | 'add' | 'replaceBackground';

const App: React.FC = () => {
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editHotspot, setEditHotspot] = useState<{ x: number, y: number } | null>(null);
  const [displayHotspot, setDisplayHotspot] = useState<{ x: number, y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  const [editMode, setEditMode] = useState<EditMode>('modify');
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);
  
  // State for the new text feature
  const [text, setText] = useState<string>('');
  const [textColor, setTextColor] = useState<string>('#FFFFFF');
  const [textSize, setTextSize] = useState<number>(48);
  const [textPosition, setTextPosition] = useState<{ x: number, y: number }>({ x: 50, y: 50 }); // as percentage

  const imgRef = useRef<HTMLImageElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);


  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  // Effect to create and revoke object URLs safely for the current image
  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]);
  
  // Effect to create and revoke object URLs safely for the original image
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);


  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const addImageToHistory = useCallback((newImageFile: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, [history, historyIndex]);

  const handleImageUpload = useCallback((file: File) => {
    setError(null);
    setHistory([file]);
    setHistoryIndex(0);
    setEditHotspot(null);
    setDisplayHotspot(null);
    setActiveTab('retouch');
    setEditMode('replaceBackground');
    setPrompt('remove background and add studio like effect');
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, []);

  const handleRetouchAction = useCallback(async () => {
    if (!currentImage) {
      setError('No image loaded to edit.');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
        let editedImageUrl;

        switch (editMode) {
          case 'modify':
          case 'add':
            if (!prompt.trim()) { setError(`Please enter a description for what to ${editMode}.`); return; }
            if (!editHotspot) { setError('Please click on the image to select an area.'); return; }
            editedImageUrl = await generateEditedImage(currentImage, prompt, editHotspot, editMode);
            break;
          
          case 'remove':
            if (!editHotspot) { setError('Please click on the object to remove.'); return; }
            editedImageUrl = await generateEditedImage(currentImage, 'Remove the object at this point', editHotspot, 'remove');
            break;
            
          case 'replaceBackground':
            if (!prompt.trim()) { setError('Please enter a description for the new background.'); return; }
            editedImageUrl = await generateReplacedBackgroundImage(currentImage, prompt);
            break;
        }

        const newImageFile = dataURLtoFile(editedImageUrl, `edited-${Date.now()}.png`);
        addImageToHistory(newImageFile);
        setEditHotspot(null);
        setDisplayHotspot(null);
        setPrompt('');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to generate the image. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, prompt, editHotspot, addImageToHistory, editMode]);
  
  const handleApplyFilter = useCallback(async (filterPrompt: string) => {
    if (!currentImage) {
      setError('No image loaded to apply a filter to.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const filteredImageUrl = await generateFilteredImage(currentImage, filterPrompt);
        const newImageFile = dataURLtoFile(filteredImageUrl, `filtered-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to apply the filter. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory]);
  
  const handleApplyAdjustment = useCallback(async (adjustmentPrompt: string) => {
    if (!currentImage) {
      setError('No image loaded to apply an adjustment to.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const adjustedImageUrl = await generateAdjustedImage(currentImage, adjustmentPrompt);
        const newImageFile = dataURLtoFile(adjustedImageUrl, `adjusted-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to apply the adjustment. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory]);

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
        setError('Please select an area to crop.');
        return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        setError('Could not process the crop.');
        return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );
    
    const croppedImageUrl = canvas.toDataURL('image/png');
    const newImageFile = dataURLtoFile(croppedImageUrl, `cropped-${Date.now()}.png`);
    addImageToHistory(newImageFile);

  }, [completedCrop, addImageToHistory]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      setHistoryIndex(historyIndex - 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [canUndo, historyIndex]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
      setHistoryIndex(historyIndex + 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [canRedo, historyIndex]);

  const handleReset = useCallback(() => {
    if (history.length > 0) {
      setHistoryIndex(0);
      setError(null);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [history]);

  const handleUploadNew = useCallback(() => {
      setHistory([]);
      setHistoryIndex(-1);
      setError(null);
      setPrompt('');
      setEditHotspot(null);
      setDisplayHotspot(null);
  }, []);

  const handleDownload = useCallback(() => {
      if (!currentImage || !imgRef.current) return;
    
      const image = imgRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
  
      if (!ctx) return;
      
      // Draw image
      ctx.drawImage(image, 0, 0);
      
      // Draw text if there is any
      if (text.trim()) {
        const scale = image.naturalWidth / image.clientWidth;
        const scaledFontSize = textSize * scale;
  
        ctx.font = `bold ${scaledFontSize}px Inter, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
  
        // Set shadow properties to match the CSS text-shadow for perfect consistency
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2 * scale; // Scale shadow offset
        ctx.shadowBlur = 5 * scale;    // Scale shadow blur
  
        // Calculate text position in pixels
        const x = (textPosition.x / 100) * canvas.width;
        const y = (textPosition.y / 100) * canvas.height;
        
        // Draw the text with the shadow
        ctx.fillText(text, x, y);
      }
      
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `edited-${currentImage.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }, [currentImage, text, textColor, textSize, textPosition]);
  
  const handleFileSelect = (files: FileList | null) => {
    if (files && files[0]) {
      handleImageUpload(files[0]);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const hotspotNeeded = activeTab === 'retouch' && ['modify', 'add', 'remove'].includes(editMode);
    if (!hotspotNeeded) return;
    
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    setDisplayHotspot({ x: offsetX, y: offsetY });

    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
    const scaleX = naturalWidth / clientWidth;
    const scaleY = naturalHeight / clientHeight;

    const originalX = Math.round(offsetX * scaleX);
    const originalY = Math.round(offsetY * scaleY);

    setEditHotspot({ x: originalX, y: originalY });
  };

  const handleEditModeChange = (mode: EditMode) => {
    setEditMode(mode);
    setEditHotspot(null);
    setDisplayHotspot(null);
    setPrompt('');
    setError(null);
  }

  const handleTextMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = textContainerRef.current;
    if (!container) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = textPosition;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      const containerRect = container.getBoundingClientRect();
      const newX = startPos.x + (dx / containerRect.width) * 100;
      const newY = startPos.y + (dy / containerRect.height) * 100;

      const clampedX = Math.max(0, Math.min(100, newX));
      const clampedY = Math.max(0, Math.min(100, newY));

      setTextPosition({ x: clampedX, y: clampedY });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [textPosition]);

  const renderContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-red-300">An Error Occurred</h2>
            <p className="text-md text-red-400">{error}</p>
            <button
                onClick={() => setError(null)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
              >
                Try Again
            </button>
          </div>
        );
    }
    
    if (!currentImageUrl) {
      return <StartScreen onFileSelect={handleFileSelect} />;
    }
    
    const hotspotNeeded = activeTab === 'retouch' && ['modify', 'add', 'remove'].includes(editMode);

    const imageDisplay = (
      <div className="relative">
        {originalImageUrl && (
            <img
                key={originalImageUrl}
                src={originalImageUrl}
                alt="Original"
                className="w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none"
            />
        )}
        <img
            ref={imgRef}
            key={currentImageUrl}
            src={currentImageUrl}
            alt="Current"
            onClick={handleImageClick}
            className={`absolute top-0 left-0 w-full h-auto object-contain max-h-[60vh] rounded-xl transition-opacity duration-200 ease-in-out ${isComparing ? 'opacity-0' : 'opacity-100'} ${hotspotNeeded ? 'cursor-crosshair' : ''}`}
        />
      </div>
    );
    
    const cropImageElement = (
      <img 
        ref={imgRef}
        key={`crop-${currentImageUrl}`}
        src={currentImageUrl} 
        alt="Crop this image"
        className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
      />
    );


    return (
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative w-full flex justify-center items-center shadow-2xl rounded-xl overflow-hidden bg-black/20" ref={imageContainerRef}>
            {isLoading && (
                <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in">
                    <Spinner />
                    <p className="text-gray-300">AI is working its magic...</p>
                </div>
            )}

            <div ref={textContainerRef} className="relative inline-block">
                {activeTab === 'crop' ? (
                  <ReactCrop 
                    crop={crop} 
                    onChange={c => setCrop(c)} 
                    onComplete={c => setCompletedCrop(c)}
                    aspect={aspect}
                    className="max-h-[60vh]"
                  >
                    {cropImageElement}
                  </ReactCrop>
                ) : imageDisplay }

                {text.trim() && (
                  <div
                    onMouseDown={activeTab === 'text' ? handleTextMouseDown : undefined}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 select-none p-2 z-20 ${activeTab === 'text' ? 'cursor-move' : 'pointer-events-none'}`}
                    style={{
                      left: `${textPosition.x}%`,
                      top: `${textPosition.y}%`,
                      color: textColor,
                      fontSize: `${textSize}px`,
                      fontWeight: 'bold',
                      fontFamily: 'Inter, sans-serif',
                      textShadow: '0px 2px 5px rgba(0,0,0,0.8)',
                    }}
                  >
                    {text}
                  </div>
                )}

                {displayHotspot && !isLoading && hotspotNeeded && (
                    <div 
                        className="absolute rounded-full w-6 h-6 bg-blue-500/50 border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10"
                        style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                    >
                        <div className="absolute inset-0 rounded-full w-6 h-6 animate-ping bg-blue-400"></div>
                    </div>
                )}
            </div>
        </div>
        
        <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm">
            {(['retouch', 'text', 'adjust', 'filters', 'crop'] as Tab[]).map(tab => (
                 <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full capitalize font-semibold py-2 px-3 text-sm sm:py-3 sm:px-5 sm:text-base rounded-md transition-all duration-200 ${
                        activeTab === tab 
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                >
                    {tab}
                </button>
            ))}
        </div>
        
        <div className="w-full">
            {activeTab === 'retouch' && (
                <div className="flex flex-col items-center gap-4">
                    <div className="w-full bg-gray-900/50 border border-gray-700/60 rounded-lg p-1 flex items-center justify-center gap-1">
                        {(['modify', 'add', 'remove', 'replaceBackground'] as EditMode[]).map(mode => (
                             <button
                                key={mode}
                                onClick={() => handleEditModeChange(mode)}
                                className={`w-full capitalize font-semibold py-2 px-4 rounded-md transition-all duration-200 text-sm ${
                                    editMode === mode 
                                    ? 'bg-white/10 text-white' 
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {mode === 'replaceBackground' ? 'Background' : mode}
                            </button>
                        ))}
                    </div>
                    <p className="text-md text-gray-400 text-center">
                      {editMode === 'replaceBackground' && 'Describe the new background for your image.'}
                      {['modify', 'add'].includes(editMode) && (editHotspot ? 'Great! Now describe your edit below.' : 'Click an area on the image to make a precise edit.')}
                      {editMode === 'remove' && (editHotspot ? 'Ready. Click the button to remove the object.' : 'Click on the object you want to remove.')}
                    </p>
                    
                    {(['modify', 'add', 'replaceBackground'].includes(editMode)) && (
                      <form onSubmit={(e) => { e.preventDefault(); handleRetouchAction(); }} className="w-full flex flex-col sm:flex-row items-center gap-2">
                          <input
                              type="text"
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                              placeholder={
                                editMode === 'modify' ? "e.g., 'change shirt color to blue'" : 
                                editMode === 'add' ? "e.g., 'a small butterfly on the flower'" : 
                                "e.g., 'a futuristic cityscape at night'"
                              }
                              className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-4 text-base sm:p-5 sm:text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isLoading || (hotspotNeeded && !editHotspot)}
                          />
                          <button 
                              type="submit"
                              className="w-full sm:w-auto flex-shrink-0 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 text-base sm:py-5 sm:px-8 sm:text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                              disabled={isLoading || !prompt.trim() || (hotspotNeeded && !editHotspot)}
                          >
                              Generate
                          </button>
                      </form>
                    )}
                    
                    {editMode === 'remove' && (
                       <button 
                            onClick={handleRetouchAction}
                            className="w-full bg-gradient-to-br from-red-600 to-red-500 text-white font-bold py-4 px-6 text-base sm:py-5 sm:px-8 sm:text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-red-800 disabled:to-red-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                            disabled={isLoading || !editHotspot}
                        >
                            Remove Object
                        </button>
                    )}
                </div>
            )}
            {activeTab === 'text' && <TextPanel 
                text={text}
                setText={setText}
                textColor={textColor}
                setTextColor={setTextColor}
                textSize={textSize}
                setTextSize={setTextSize}
            />}
            {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop?.width && completedCrop.width > 0} />}
            {activeTab === 'adjust' && <AdjustmentPanel onApplyAdjustment={handleApplyAdjustment} isLoading={isLoading} />}
            {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} />}
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button 
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Undo last action"
            >
                <UndoIcon className="w-5 h-5 mr-2" />
                Undo
            </button>
            <button 
                onClick={handleRedo}
                disabled={!canRedo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Redo last action"
            >
                <RedoIcon className="w-5 h-5 mr-2" />
                Redo
            </button>
            
            <div className="h-6 w-px bg-gray-600 mx-1 hidden sm:block"></div>

            {canUndo && (
              <button 
                  onMouseDown={() => setIsComparing(true)}
                  onMouseUp={() => setIsComparing(false)}
                  onMouseLeave={() => setIsComparing(false)}
                  onTouchStart={() => setIsComparing(true)}
                  onTouchEnd={() => setIsComparing(false)}
                  className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
                  aria-label="Press and hold to see original image"
              >
                  <EyeIcon className="w-5 h-5 mr-2" />
                  Compare
              </button>
            )}

            <button 
                onClick={handleReset}
                disabled={!canUndo}
                className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
              >
                Reset
            </button>
            <button 
                onClick={handleUploadNew}
                className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
            >
                Upload New
            </button>

            <button 
                onClick={handleDownload}
                className="w-full sm:w-auto sm:ml-auto bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
            >
                Download Image
            </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${currentImage ? 'items-start' : 'items-center'}`}>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, X, FileImage, FileText, Clipboard, Sparkles, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type UploadedFile = {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  base64: string;
  preview?: string;
  status: 'pending' | 'parsing' | 'done' | 'error';
  error?: string;
};

type BatchImageUploaderProps = {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  onParseAll: () => void;
  isParsing: boolean;
  disabled?: boolean;
};

export function BatchImageUploader({
  files,
  onFilesChange,
  onParseAll,
  isParsing,
  disabled,
}: BatchImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const processFile = useCallback(async (file: File): Promise<UploadedFile | null> => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Full = reader.result as string;
        const base64 = base64Full.split(',')[1];
        
        resolve({
          id: generateId(),
          name: file.name,
          type: isPdf ? 'pdf' : 'image',
          base64,
          preview: isImage ? base64Full : undefined,
          status: 'pending',
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    const processed = await Promise.all(filesArray.map(processFile));
    const validFiles = processed.filter((f): f is UploadedFile => f !== null);
    
    if (validFiles.length > 0) {
      onFilesChange([...files, ...validFiles]);
    }
  }, [files, onFilesChange, processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];

    for (const item of items) {
      if (item.type.startsWith('image/') || item.type === 'application/pdf') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const removeFile = useCallback((id: string) => {
    onFilesChange(files.filter(f => f.id !== id));
  }, [files, onFilesChange]);

  const clearAll = useCallback(() => {
    onFilesChange([]);
  }, [onFilesChange]);

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
          disabled && "opacity-50 pointer-events-none"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              Drop images or PDFs here, or click to browse
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Supports multiple files • Ctrl+V to paste from clipboard
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <FileImage className="w-3 h-3" /> Images
            </Badge>
            <Badge variant="outline" className="gap-1">
              <FileText className="w-3 h-3" /> PDF
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clipboard className="w-3 h-3" /> Paste
            </Badge>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{files.length} file{files.length !== 1 && 's'}</span>
              {doneCount > 0 && (
                <Badge variant="default" className="bg-green-500">{doneCount} done</Badge>
              )}
              {pendingCount > 0 && (
                <Badge variant="secondary">{pendingCount} pending</Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="destructive">{errorCount} error</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={isParsing}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear All
              </Button>
              <Button
                onClick={onParseAll}
                disabled={isParsing || pendingCount === 0}
                className="gap-2"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Parse All ({pendingCount})
                  </>
                )}
              </Button>
            </div>
          </div>

          <ScrollArea className="max-h-[300px]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={cn(
                    "relative group rounded-lg border overflow-hidden",
                    file.status === 'done' && "border-green-500",
                    file.status === 'error' && "border-destructive",
                    file.status === 'parsing' && "border-primary"
                  )}
                >
                  {file.type === 'image' && file.preview ? (
                    <img
                      src={file.preview}
                      alt={file.name}
                      className="w-full h-24 object-cover"
                    />
                  ) : (
                    <div className="w-full h-24 bg-muted flex items-center justify-center">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Status Overlay */}
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {file.status === 'parsing' && (
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    )}
                    {file.status === 'done' && (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    )}
                    {file.status === 'error' && (
                      <AlertCircle className="w-6 h-6 text-destructive" />
                    )}
                  </div>

                  {/* Remove Button */}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    disabled={file.status === 'parsing'}
                  >
                    <X className="w-3 h-3" />
                  </Button>

                  {/* File Name */}
                  <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-2 py-1">
                    <p className="text-xs truncate">{file.name}</p>
                  </div>

                  {/* Status Badge */}
                  {file.status !== 'pending' && (
                    <div className="absolute top-1 left-1">
                      {file.status === 'parsing' && (
                        <Badge className="text-xs px-1.5 py-0">Parsing</Badge>
                      )}
                      {file.status === 'done' && (
                        <Badge className="text-xs px-1.5 py-0 bg-green-500">Done</Badge>
                      )}
                      {file.status === 'error' && (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0">Error</Badge>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

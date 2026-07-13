import type { ExportResult } from '../../ports/projectStore.ts';

export class DownloadStore {
  exportJson(fileName: string, text: string): ExportResult {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { fileName, mode: 'download' };
  }
}

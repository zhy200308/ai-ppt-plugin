// ============================================================
//  Canva Connect API Wrapper
//  Handles Brand Template Autofill, Design Export, and Polling
// ============================================================

export interface CanvaAutofillData {
  [key: string]: {
    type: 'text';
    text: string;
  } | {
    type: 'image';
    asset_id: string; // If you uploaded an image to Canva first
  };
}

export interface CanvaConfig {
  accessToken: string;
}

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

async function canvaFetch(endpoint: string, config: CanvaConfig, options: RequestInit = {}) {
  const url = `${CANVA_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Canva API Error (${res.status}): ${errText}`);
  }
  
  return res.json();
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 1. Fill a brand template with text variables
 * Returns the final design ID.
 */
export async function createDesignFromTemplate(
  templateId: string,
  title: string,
  data: CanvaAutofillData,
  config: CanvaConfig
): Promise<string> {
  // Step 1: Start autofill job
  const autofillRes = await canvaFetch('/autofills', config, {
    method: 'POST',
    body: JSON.stringify({
      brand_template_id: templateId,
      title: title || 'AI Generated Slide',
      data,
    }),
  });

  const jobId = autofillRes.job.id;

  // Step 2: Poll for success
  let maxRetries = 20;
  while (maxRetries > 0) {
    await delay(2000);
    const jobStatus = await canvaFetch(`/autofills/${jobId}`, config);
    if (jobStatus.job.status === 'success') {
      return jobStatus.job.result.design.id;
    }
    if (jobStatus.job.status === 'failed') {
      throw new Error(`Canva Autofill Failed: ${jobStatus.job.error?.message || 'Unknown error'}`);
    }
    maxRetries--;
  }

  throw new Error('Canva Autofill Timed Out');
}

/**
 * 2. Export an existing design to PNG
 * Returns the download URL.
 */
export async function exportDesignToImage(designId: string, config: CanvaConfig): Promise<string> {
  // Step 1: Start export job
  const exportRes = await canvaFetch('/exports', config, {
    method: 'POST',
    body: JSON.stringify({
      design_id: designId,
      format: {
        type: 'png',
      },
    }),
  });

  const jobId = exportRes.job.id;

  // Step 2: Poll for success
  let maxRetries = 20;
  while (maxRetries > 0) {
    await delay(2000);
    const jobStatus = await canvaFetch(`/exports/${jobId}`, config);
    if (jobStatus.job.status === 'success') {
      const urls = jobStatus.job.urls;
      if (!urls || urls.length === 0) throw new Error('No URLs returned from Canva Export');
      return urls[0]; // Assuming single page template
    }
    if (jobStatus.job.status === 'failed') {
      throw new Error(`Canva Export Failed: ${jobStatus.job.error?.message || 'Unknown error'}`);
    }
    maxRetries--;
  }

  throw new Error('Canva Export Timed Out');
}

/**
 * 3. Helper: Download URL and convert to Base64
 */
export async function downloadImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image from Canva: ${res.statusText}`);
  
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Main Pipeline: Render a Canva Template and return Base64 image
 */
export async function renderCanvaTemplate(
  templateId: string,
  title: string,
  textVariables: Record<string, string>,
  config: CanvaConfig
): Promise<{ base64: string, mimeType: 'image/png' }> {
  // Transform flat KV to Canva data structure
  const canvaData: CanvaAutofillData = {};
  for (const [key, value] of Object.entries(textVariables)) {
    canvaData[key] = { type: 'text', text: value || ' ' };
  }

  const designId = await createDesignFromTemplate(templateId, title, canvaData, config);
  const downloadUrl = await exportDesignToImage(designId, config);
  const base64 = await downloadImageAsBase64(downloadUrl);
  
  return { base64, mimeType: 'image/png' };
}
import type { TemplateOption } from '../store';

// A mock built-in template list
// In a real scenario, base64 would be loaded from an actual PPTX file,
// or fetched from a URL and converted to base64.
export const BUILTIN_TEMPLATES: TemplateOption[] = [
  {
    id: 'tpl_tech_blue',
    name: '边擎智盾 (科技蓝)',
    thumbnailUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=225&fit=crop',
    // Mock base64 - this should be a real PPTX base64 string
    url: 'https://example.com/templates/tech_blue.pptx' 
  },
  {
    id: 'tpl_consulting_minimal',
    name: '麦肯锡极简风',
    thumbnailUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=225&fit=crop',
    url: 'https://example.com/templates/consulting.pptx'
  }
];

export async function fetchTemplateBase64(tpl: TemplateOption): Promise<string> {
  if (tpl.base64) return tpl.base64;
  
  // In a real app, we fetch the PPTX array buffer and convert to base64
  // Since we don't have a real URL here, we will just return a dummy string or throw
  if (tpl.url) {
    try {
      const res = await fetch(tpl.url);
      if (!res.ok) throw new Error('Failed to fetch template');
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1]); // remove data:xxx;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Mocking template fetch due to error or dummy URL', e);
      // Fallback for demonstration
      return 'UEsDBBQAAAAIA...'; // invalid base64 dummy
    }
  }
  throw new Error('No template source available');
}
import type { ThemeDefinition } from './types';

export const BUILTIN_THEMES: ThemeDefinition[] = [
  // --- 顶级商业咨询公司风格 (Top-tier Consulting) ---
  {
    id: 'mckinsey-classic',
    name: 'McKinsey Classic',
    primaryColor: '#051C2C', // Deep Blue
    backgroundColor: '#FFFFFF',
    accentColor: '#005F9E', // McKinsey Blue
    fontFamily: 'Helvetica, Arial, sans-serif',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 36, bold: true, color: '#051C2C', alignment: 'left' },
      body: { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 18, color: '#333333', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  {
    id: 'bain-bold',
    name: 'Bain Bold Red',
    primaryColor: '#CC0000', // Bain Red
    backgroundColor: '#FFFFFF',
    accentColor: '#595959', // Dark Gray
    fontFamily: 'Arial, sans-serif',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: 'Arial, sans-serif', fontSize: 36, bold: true, color: '#CC0000', alignment: 'left' },
      body: { fontFamily: 'Arial, sans-serif', fontSize: 18, color: '#2B2B2B', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  {
    id: 'bcg-heritage',
    name: 'BCG Heritage',
    primaryColor: '#00594C', // BCG Green
    backgroundColor: '#F9F9F9',
    accentColor: '#B08D55', // Gold
    fontFamily: 'Georgia, serif',
    defaults: {
      backgroundColor: '#F9F9F9',
      title: { fontFamily: 'Georgia, serif', fontSize: 38, bold: true, color: '#00594C', alignment: 'left' },
      body: { fontFamily: 'Arial, sans-serif', fontSize: 18, color: '#333333', alignment: 'left', lineSpacing: 1.25 },
    },
  },
  {
    id: 'roland-berger',
    name: 'Roland Berger Teal',
    primaryColor: '#00727B', // Teal
    backgroundColor: '#FFFFFF',
    accentColor: '#E6E6E6', // Light Gray
    fontFamily: 'Arial, sans-serif',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: 'Arial, sans-serif', fontSize: 36, bold: true, color: '#00727B', alignment: 'left' },
      body: { fontFamily: 'Arial, sans-serif', fontSize: 18, color: '#4A4A4A', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  {
    id: 'deloitte-digital',
    name: 'Deloitte Digital',
    primaryColor: '#86BC25', // Deloitte Green
    backgroundColor: '#000000', // Black Background
    accentColor: '#00A3E0', // Cyan
    fontFamily: 'Open Sans, Arial, sans-serif',
    defaults: {
      backgroundColor: '#000000',
      title: { fontFamily: 'Open Sans, Arial, sans-serif', fontSize: 36, bold: true, color: '#86BC25', alignment: 'left' },
      body: { fontFamily: 'Open Sans, Arial, sans-serif', fontSize: 18, color: '#E0E0E0', alignment: 'left', lineSpacing: 1.3 },
    },
  },
  // --- 科技巨头与现代发布会风格 (Tech & Keynote) ---
  {
    id: 'apple-keynote',
    name: 'Apple Keynote Minimal',
    primaryColor: '#1D1D1F', // Dark text
    backgroundColor: '#F5F5F7', // Apple light gray
    accentColor: '#0066CC', // Apple blue link
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    defaults: {
      backgroundColor: '#F5F5F7',
      title: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 44, bold: true, color: '#1D1D1F', alignment: 'center' },
      body: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 24, color: '#86868B', alignment: 'center', lineSpacing: 1.4 },
    },
  },
  {
    id: 'stripe-startup',
    name: 'Stripe Startup',
    primaryColor: '#0A2540', // Deep Navy
    backgroundColor: '#F6F9FC', // Stripe gray-blue
    accentColor: '#635BFF', // Stripe purple-blue
    fontFamily: 'Inter, system-ui, sans-serif',
    defaults: {
      backgroundColor: '#F6F9FC',
      title: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 36, bold: true, color: '#0A2540', alignment: 'left' },
      body: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18, color: '#425466', alignment: 'left', lineSpacing: 1.5 },
    },
  },
  {
    id: 'vercel-fintech',
    name: 'Vercel Contrast',
    primaryColor: '#000000',
    backgroundColor: '#FFFFFF',
    accentColor: '#0070F3', // Vercel Blue
    fontFamily: 'Inter, system-ui, sans-serif',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 40, bold: true, color: '#000000', alignment: 'left' },
      body: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18, color: '#666666', alignment: 'left', lineSpacing: 1.5 },
    },
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    primaryColor: '#00FF41', // Neon Green
    backgroundColor: '#0D0D0D',
    accentColor: '#FF003C', // Neon Pink/Red
    fontFamily: '"Courier New", Courier, monospace',
    defaults: {
      backgroundColor: '#0D0D0D',
      title: { fontFamily: '"Courier New", Courier, monospace', fontSize: 36, bold: true, color: '#00FF41', alignment: 'left' },
      body: { fontFamily: '"Courier New", Courier, monospace', fontSize: 18, color: '#CCCCCC', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  // --- 其他现有分类与补充 ... ---
  {
    id: 'modern-blue',
    name: 'Modern Blue',
    primaryColor: '#1A3C6E',
    backgroundColor: '#FFFFFF',
    accentColor: '#2B6CB0',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: {
        fontFamily: '微软雅黑',
        fontSize: 36,
        bold: true,
        color: '#1A3C6E',
        alignment: 'left',
      },
      body: {
        fontFamily: '微软雅黑',
        fontSize: 20,
        color: '#1F2937',
        alignment: 'left',
        lineSpacing: 1.15,
      },
    },
  },
  // 教育（答辩/汇报/教学/高校/研究生/比赛等）优先：多套稳重、清晰、阅读友好
  {
    id: 'edu-thesis-blue',
    name: 'Edu Thesis Blue',
    primaryColor: '#0F4C81',
    backgroundColor: '#FFFFFF',
    accentColor: '#2563EB',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: '微软雅黑', fontSize: 34, bold: true, color: '#0F4C81', alignment: 'left' },
      body: { fontFamily: '微软雅黑', fontSize: 20, color: '#1F2937', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  {
    id: 'edu-defense-green',
    name: 'Edu Defense Green',
    primaryColor: '#166534',
    backgroundColor: '#FFFFFF',
    accentColor: '#16A34A',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: '微软雅黑', fontSize: 34, bold: true, color: '#166534', alignment: 'left' },
      body: { fontFamily: '微软雅黑', fontSize: 20, color: '#111827', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  {
    id: 'edu-seminar-purple',
    name: 'Edu Seminar Purple',
    primaryColor: '#4C1D95',
    backgroundColor: '#FFFFFF',
    accentColor: '#7C3AED',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: '微软雅黑', fontSize: 34, bold: true, color: '#4C1D95', alignment: 'left' },
      body: { fontFamily: '微软雅黑', fontSize: 20, color: '#1F2937', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  {
    id: 'edu-teaching-warm',
    name: 'Edu Teaching Warm',
    primaryColor: '#9A3412',
    backgroundColor: '#FFFBEB',
    accentColor: '#F59E0B',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#FFFBEB',
      title: { fontFamily: '微软雅黑', fontSize: 34, bold: true, color: '#9A3412', alignment: 'left' },
      body: { fontFamily: '微软雅黑', fontSize: 20, color: '#1F2937', alignment: 'left', lineSpacing: 1.25 },
    },
  },
  {
    id: 'edu-research-gray',
    name: 'Edu Research Gray',
    primaryColor: '#111827',
    backgroundColor: '#FFFFFF',
    accentColor: '#6B7280',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: '微软雅黑', fontSize: 36, bold: true, color: '#111827', alignment: 'left' },
      body: { fontFamily: '微软雅黑', fontSize: 20, color: '#374151', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  {
    id: 'edu-competition-red',
    name: 'Edu Competition Red',
    primaryColor: '#7F1D1D',
    backgroundColor: '#FFFFFF',
    accentColor: '#DC2626',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: { fontFamily: '微软雅黑', fontSize: 34, bold: true, color: '#7F1D1D', alignment: 'left' },
      body: { fontFamily: '微软雅黑', fontSize: 20, color: '#111827', alignment: 'left', lineSpacing: 1.2 },
    },
  },

  // 通用企业级：科技/金融/深色
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    primaryColor: '#111827',
    backgroundColor: '#FFFFFF',
    accentColor: '#6B7280',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#FFFFFF',
      title: {
        fontFamily: '微软雅黑',
        fontSize: 38,
        bold: true,
        color: '#111827',
        alignment: 'left',
      },
      body: {
        fontFamily: '微软雅黑',
        fontSize: 20,
        color: '#374151',
        alignment: 'left',
        lineSpacing: 1.2,
      },
    },
  },
  {
    id: 'finance-blackgold',
    name: 'Finance BlackGold',
    primaryColor: '#F5D565',
    backgroundColor: '#0B1220',
    accentColor: '#D4AF37',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#0B1220',
      title: { fontFamily: '微软雅黑', fontSize: 36, bold: true, color: '#F5D565', alignment: 'left' },
      body: { fontFamily: '微软雅黑', fontSize: 20, color: '#E5E7EB', alignment: 'left', lineSpacing: 1.2 },
    },
  },
  {
    id: 'tech-cyan',
    name: 'Tech Cyan',
    primaryColor: '#22D3EE',
    backgroundColor: '#07121E',
    accentColor: '#38BDF8',
    fontFamily: '微软雅黑',
    defaults: {
      backgroundColor: '#07121E',
      title: { fontFamily: '微软雅黑', fontSize: 36, bold: true, color: '#E5E7EB', alignment: 'left' },
      body: { fontFamily: '微软雅黑', fontSize: 20, color: '#D1D5DB', alignment: 'left', lineSpacing: 1.2 },
    },
  },
];

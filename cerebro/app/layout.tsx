import type {Metadata} from 'next';
import localFont from 'next/font/local';
import './globals.css';

// DM Sans do site da Rocco, servida localmente (sem depender do Google Fonts).
const sans = localFont({
  src: [
    {path: './fontes/dm-sans-latin-400-normal.woff2', weight: '400'},
    {path: './fontes/dm-sans-latin-500-normal.woff2', weight: '500'},
    {path: './fontes/dm-sans-latin-700-normal.woff2', weight: '700'},
  ],
  variable: '--font-sans',
});

export const metadata: Metadata = {title: 'Cérebro Rocco', description: 'O sistema da Rocco Kids'};

export default function Raiz({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className={`${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}

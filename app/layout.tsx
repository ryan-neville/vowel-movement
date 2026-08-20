import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vowel Movement',
  description:
    'A daily word square in four sizes - 4x4, 5x5, 6x6 and 7x7. Drag the day&apos;s bank of vowels into the blanks to spell every row and every column.',
  applicationName: 'Vowel Movement',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f2ee' },
    { media: '(prefers-color-scheme: dark)', color: '#14161b' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
          The grid is derived from the visitor's local date, so it cannot exist
          in the pre-rendered HTML - without scripting the page would otherwise
          sit on "Loading today's grid..." forever with nothing explaining why.
        */}
        <noscript>
          <div className="noscript">
            <strong>Vowel Movement needs JavaScript.</strong> The daily grid is worked out on your
            own device from today’s date - there is no server to send one.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}

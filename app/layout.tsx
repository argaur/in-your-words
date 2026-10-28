import type { Metadata } from "next";
import { Analytics } from "@/components/Analytics";
import "./tokens.css";
import "./brand.css";
import "./legacy.css";

export const metadata: Metadata = {
  title: "In Your Words",
  description: "Job application answers, drafted only from stories you said out loud.",
};

// Light is the default, set by the page, never by the OS (SPEC C5). Runs before first paint so the
// wrong theme never flashes: ?theme= wins, then the stored choice, then light.
const THEME_SCRIPT = `(function(){var t="light";try{var p=new URLSearchParams(location.search).get("theme");var s=localStorage.getItem("iyw-theme");t=p==="dark"||p==="light"?p:(s==="dark"||s==="light"?s:"light");if(p===t)localStorage.setItem("iyw-theme",t);}catch(e){}document.documentElement.setAttribute("data-theme",t);})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Sofia+Sans+Extra+Condensed:wght@800&display=swap"
        />
      </head>
      <body>
        <Analytics />
        {children}
      </body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Relatórios WhatsApp — SMSNET",
  description: "Painel de relatórios de envio de mensagens do gateway WhatsApp.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

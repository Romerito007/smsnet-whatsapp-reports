import "./globals.css";

export const metadata = {
  title: "Relatórios WhatsApp — SMSNET",
  description: "Painel de relatórios de envio de mensagens do gateway WhatsApp.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

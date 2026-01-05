import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Pay - AZ Flight Basketball",
  description: "Payment tracking for AZ Flight Basketball",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

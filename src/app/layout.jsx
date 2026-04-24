import Script from "next/script";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteChrome } from "@/components/layout/site-chrome";
const bodyFont = DM_Sans({
    variable: "--font-body",
    subsets: ["latin"],
});
const headingFont = Space_Grotesk({
    variable: "--font-heading",
    subsets: ["latin"],
});
export const metadata = {
    title: "Chikki Beds",
    description: "City-based bed booking platform for consumers and owners",
};
export default function RootLayout({ children, }) {
    return (<html lang="en">
      <head>
      </head>
      <body className={`${bodyFont.variable} ${headingFont.variable} antialiased`}>
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
        <Script src="https://www.google.com/recaptcha/api.js" strategy="beforeInteractive" />
      </body>
    </html>);
}

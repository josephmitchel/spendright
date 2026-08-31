import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SpendRight",
  description: "Spending optimization through credit card rewards",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

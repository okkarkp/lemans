import type { MetadataRoute } from "next";

// Installable on a phone's home screen. There is deliberately no offline mode: a check-in is only
// evidence when the server sees it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LeMans 2.0 - Attendance, leave and billing",
    short_name: "LeMans",
    description: "Daily check-in, leave and monthly billing record",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#460073",
    theme_color: "#460073",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

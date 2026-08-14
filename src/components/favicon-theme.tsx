"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

const SIZES = [16, 32, 192, 512] as const;

function setIcons(scheme: "dark" | "light") {
  for (const size of SIZES) {
    const href = `/favicon/favicon-${scheme}-${size}.png`;
    const selector = `link[rel="icon"][sizes="${size}x${size}"]`;
    let link = document.head.querySelector<HTMLLinkElement>(selector);
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.sizes = `${size}x${size}`;
      document.head.appendChild(link);
    }
    link.href = href;
  }
}

export function FaviconTheme() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setIcons(resolvedTheme === "light" ? "light" : "dark");
  }, [resolvedTheme]);

  return null;
}

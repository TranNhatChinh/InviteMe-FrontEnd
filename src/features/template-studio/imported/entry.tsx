"use client";
import dynamic from "next/dynamic";
export const ImportedStudio = dynamic(
  () => import("./studio").then((module) => module.ImportedStudio),
  { ssr: false },
);

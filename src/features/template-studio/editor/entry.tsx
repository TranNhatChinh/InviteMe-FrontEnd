"use client";

import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";

// Craft creates random node IDs on initialization; the editor is a browser-only workspace.
export const TemplateStudio = dynamic(
  () => import("./studio").then((module) => module.TemplateStudio),
  {
    ssr: false,
    loading: () => (
      <main id="main-content">
        <StudioLoading />
      </main>
    ),
  },
);

function StudioLoading() {
  const { t } = useTranslation("screens");
  return <>{t("openTemplateStudio")}</>;
}

"use client";
import { createContext, useContext } from "react";

export type StudioMode = "invitation" | "website";
export const StudioModeContext = createContext<StudioMode>("invitation");
export const useStudioMode = () => useContext(StudioModeContext);

"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { LayoutStyle } from "@/lib/layout-style/constants";

type LayoutStyleTransitionProps = { layoutStyle: LayoutStyle; children: React.ReactNode };

export function LayoutStyleTransition({ layoutStyle, children }: LayoutStyleTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={layoutStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

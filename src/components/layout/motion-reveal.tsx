"use client";

import { motion } from "framer-motion";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type MotionRevealProps = ComponentProps<typeof motion.div> & {
  delay?: number;
  y?: number;
  rotate?: number;
};

export function MotionReveal({
  children,
  className,
  delay = 0,
  y = 24,
  rotate = 0,
  ...props
}: MotionRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y, rotate }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
